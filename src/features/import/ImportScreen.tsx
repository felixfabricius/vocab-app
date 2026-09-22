import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Screen } from "@/app/components/ui";
import { repo } from "@/app/services";
import { draftContext, llmEnv } from "@/app/llmEnv";
import { useSettings } from "@/app/useSettings";
import { parsePasteImport, parseTsvLines } from "@/core/import/paste";
import { latestTimestamp, parseTranslateLog, rowsAfter } from "@/core/import/translateLog";
import type { ImportBatch } from "@/core/types";
import { enrichEntryIds } from "@/features/entries/enrichService";
import { createCardsFromLookups, newLookup } from "@/features/translate/lookupsService";
import { runJob, useJob } from "@/app/jobs";
import { JobBar } from "./DraftsTable";
import { ManualAddCard } from "./ManualAddCard";
import { prepareImage } from "@/llm/image";
import { draftFromImage, draftFromText, draftManual, scanText, SCAN_THRESHOLD_WORDS } from "@/llm/pipelines";
import type { EntryDraft } from "@/core/types";
import type { BuilderContext } from "@/llm/prompts/builders";
import { PromptBuilderCard } from "./PromptBuilderCard";
import { createBatch } from "./importService";
import { loadFrequency } from "@/core/priority/frequency";

type Busy = { label: string } | undefined;

export function ImportScreen() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const [busy, setBusy] = useState<Busy>();
  const [msg, setMsg] = useState<string | undefined>();
  const [paste, setPaste] = useState("");
  const [text, setText] = useState("");
  const [pageRef, setPageRef] = useState("");
  const [tag, setTag] = useState("");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [bareCount, setBareCount] = useState(0);
  const [lookupCount, setLookupCount] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const logInput = useRef<HTMLInputElement>(null);

  const hasKey = !!settings?.anthropicKey;
  const job = useJob();
  const tagOpt = tag.trim() ? { tag: tag.trim() } : {};
  const pastedTag = paste.includes("{") ? parsePasteImport(paste).tag : undefined;

  async function refreshBatches() {
    setBatches(await repo.listBatches());
    setBareCount((await repo.entryIdsWithoutSentences()).length);
    setLookupCount(await repo.countUnconsumedLookups());
  }

  /** Lookups → one batch; the table opens at once and fills in while Claude enriches (when a key exists). */
  function onCreateFromLookups() {
    let opened = false;
    const handle = runJob({
      label: "Creating cards from lookups",
      task: async (signal, progress) => {
        const ctx = hasKey ? await draftContext() : undefined;
        return createCardsFromLookups(repo, hasKey ? llmEnv : undefined, ctx, {
          signal,
          onProgress: progress,
          onBatch: (batchId) => {
            opened = true;
            nav(`/import/batch/${batchId}`);
          },
        });
      },
      summary: (r) => (r.batchId ? `${r.drafts} drafts from ${r.lookups} lookups${r.enriched ? `, ${r.enriched} enriched ($${r.usd.toFixed(3)})` : ""}` : "No new lookups"),
    });
    void handle.result.then(async (r) => {
      if (!opened) {
        setMsg(r && r.lookups > 0 ? `${r.drafts} drafts` : "No new lookups since the last run.");
        await refreshBatches();
      }
    });
  }

  function onEnrichAll() {
    const handle = runJob({
      label: "Enriching with Claude",
      task: async (signal, progress) => {
        const ids = (await repo.entryIdsWithoutSentences()).slice(0, 60);
        return enrichEntryIds(repo, llmEnv, await draftContext(), ids, { signal, onProgress: progress });
      },
      summary: (r) => `${r.enriched} entries enriched, ${r.sentencesAdded} sentences added ($${r.usd.toFixed(3)})`,
    });
    void handle.result.then(async (r) => {
      await refreshBatches();
      if (r?.childBatchId) nav(`/import/batch/${r.childBatchId}`);
    });
  }
  useEffect(() => {
    void refreshBatches();
  }, []);

  async function run(label: string, fn: () => Promise<{ batchId?: string; message: string }>) {
    setBusy({ label });
    setMsg(undefined);
    try {
      const r = await fn();
      setMsg(r.message);
      await refreshBatches();
      if (r.batchId) nav(`/import/batch/${r.batchId}`);
    } catch (e) {
      setMsg(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(undefined);
    }
  }

  async function onPhoto(file: File) {
    await run("Photo import", async () => {
      const img = await prepareImage(file);
      const ctx = await draftContext();
      const out = await draftFromImage(llmEnv, ctx, img);
      if (out.drafts.length === 0) return { message: `No vocabulary found. ${out.notes ?? ""}` };
      const batch = await createBatch(repo, {
        sourceType: "photo",
        label: `Photo ${new Date().toLocaleString()}`,
        ...(pageRef ? { pageRef } : {}),
        ...tagOpt,
        imageHash: img.hash,
        drafts: out.drafts.map((d) => (pageRef && !d.pageRef ? { ...d, pageRef } : d)),
        frequency: await loadFrequency(),
      });
      return { batchId: batch.id, message: `${out.drafts.length} items drafted for $${out.usd.toFixed(3)}` };
    });
  }

  async function onPaste() {
    await run("Paste import", async () => {
      const looksJson = paste.includes("{");
      const parsed = looksJson ? parsePasteImport(paste) : parseTsvLines(paste);
      if (parsed.items.length === 0) {
        return { message: parsed.errors.map((e) => e.message).join("\n") || "Nothing to import" };
      }
      // The tag inside the pasted block wins over the field (it is what the prompt asked for).
      const batchTag = parsed.tag ?? tag.trim();
      const batch = await createBatch(repo, {
        sourceType: "paste",
        label: `Paste ${new Date().toLocaleString()}`,
        ...(pageRef ? { pageRef } : {}),
        ...(batchTag ? { tag: batchTag } : {}),
        drafts: parsed.items,
        frequency: await loadFrequency(),
      });
      const errs = parsed.errors.length ? ` (${parsed.errors.length} items skipped: ${parsed.errors.map((e) => e.message).join("; ")})` : "";
      setPaste("");
      return { batchId: batch.id, message: `${parsed.items.length} items imported${errs}` };
    });
  }

  async function onText() {
    await run("Text import", async () => {
      const ctx = await draftContext();
      const words = text.trim().split(/\s+/).length;
      if (words > SCAN_THRESHOLD_WORDS) {
        // Long text: scan for candidates first; accepted ones are enriched afterwards.
        const scan = await scanText(llmEnv, ctx, text, { sourceHint: "a long text, possibly subtitles" });
        if (scan.candidates.length === 0) return { message: "No candidates found." };
        const drafts: EntryDraft[] = scan.candidates.map((c) => ({
          lemma: c.lemma,
          pos: c.pos,
          isPhrase: c.isPhrase || c.pos === "phrase",
          senses: [{ gloss: c.gloss }],
          priority: c.priority,
          regional: "neutral",
          fromSentence: [],
          ...(scan.lines[c.lineIndex] ? { sourceSentence: { es: scan.lines[c.lineIndex]!, en: "" } } : {}),
        }));
        const batch = await createBatch(repo, { sourceType: "text", label: `Scan ${new Date().toLocaleString()}`, ...tagOpt, drafts, frequency: await loadFrequency() });
        setText("");
        return { batchId: batch.id, message: `${drafts.length} candidates for $${scan.usd.toFixed(3)}. Accept the ones you want, then enrich.` };
      }
      const out = await draftFromText(llmEnv, ctx, text);
      if (out.drafts.length === 0) return { message: "No vocabulary found." };
      const batch = await createBatch(repo, { sourceType: "text", label: `Text ${new Date().toLocaleString()}`, ...tagOpt, drafts: out.drafts, frequency: await loadFrequency() });
      setText("");
      return { batchId: batch.id, message: `${out.drafts.length} items drafted for $${out.usd.toFixed(3)}` };
    });
  }

  /** The Shortcuts file (until M6): new lines become lookups, then the same job as the button above. */
  async function onTranslateLog(file: File) {
    await run("Translate log import", async () => {
      const parsed = parseTranslateLog(await file.text());
      const s = await repo.getSettings();
      const fresh = rowsAfter(parsed.rows, s.translateLogImportedUntil);
      const errors = parsed.errors.length ? ` Skipped lines: ${parsed.errors.join("; ")}` : "";
      const newest = latestTimestamp(fresh);
      if (newest) await repo.saveSettings({ translateLogImportedUntil: newest });
      if (fresh.length === 0) return { message: `No new lookups since the last import.${errors}` };
      await repo.putLookups(fresh.map((r) => newLookup({ dir: r.dir, src: r.src, dst: r.dst, provider: "shortcuts", at: Number.isNaN(Date.parse(r.at)) ? undefined : new Date(r.at).toISOString() })));
      onCreateFromLookups();
      return { message: `${fresh.length} new lookups from the file.${errors}` };
    });
  }

  function onManualAi(input: string, manualTag: string) {
    void run("Add word", async () => {
      const ctx = await draftContext();
      const out = await draftManual(llmEnv, ctx, input);
      if (out.drafts.length === 0) return { message: "Nothing drafted." };
      const batch = await createBatch(repo, { sourceType: "manual", label: input, ...(manualTag ? { tag: manualTag } : {}), drafts: out.drafts, frequency: await loadFrequency() });
      return { batchId: batch.id, message: `Drafted for $${out.usd.toFixed(3)}` };
    });
  }

  function onManualSave(draft: EntryDraft, manualTag: string) {
    void run("Add word", async () => {
      const batch = await createBatch(repo, { sourceType: "manual", label: draft.lemma, ...(manualTag ? { tag: manualTag } : {}), drafts: [draft], frequency: await loadFrequency() });
      return { batchId: batch.id, message: "Saved as typed" };
    });
  }

  async function builderContext(): Promise<BuilderContext> {
    const ctx = await draftContext();
    return { chunking: ctx.settings.chunking, knownLemmas: ctx.knownLemmas, ignoreLemmas: ctx.ignoreLemmas };
  }

  const open = batches.filter((b) => b.stage !== "done");

  return (
    <Screen title="Import">
      {msg && <div className="mb-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{msg}</div>}
      {job && <JobBar job={job} />}
      {busy && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-accent/10 p-3 text-sm text-accent">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          {busy.label}…
        </div>
      )}
      {!hasKey && (
        <div className="mb-3 rounded-xl bg-easy/10 p-3 text-sm text-easy">
          No Anthropic API key yet. Photo, text and word imports need one (Settings). Paste import works without it.
        </div>
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium">{lookupCount === 0 ? "No new lookups" : `${lookupCount} lookups waiting`}</div>
            <div className="text-muted">Every translation becomes a draft{hasKey ? ", enriched with Claude" : ""}.</div>
          </div>
          <Button variant="primary" disabled={!!busy || lookupCount === 0 || job?.status === "running"} onClick={onCreateFromLookups}>
            Create cards
          </Button>
        </div>
      </Card>

      {bareCount > 0 && hasKey && (
        <Card className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">{bareCount} entries without sentences</div>
              <div className="text-muted">Add examples, gender, notes with Claude (max 60 per run).</div>
            </div>
            <Button disabled={!!busy || job?.status === "running"} onClick={onEnrichAll}>Enrich</Button>
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <label className="mb-1 block text-xs text-muted">Tag for the next import (optional; stored on every entry of the batch)</label>
        <input
          className="w-full rounded-xl bg-surface-2 px-3 py-2 text-sm"
          placeholder="e.g. Aula 1 p. 23 or Casa de Papel S1E1"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </Card>

      {open.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-medium">Inbox</h2>
          <ul className="divide-y divide-surface-2">
            {open.map((b) => (
              <li key={b.id}>
                <button className="flex w-full items-center justify-between py-2 text-left" onClick={() => nav(`/import/batch/${b.id}`)}>
                  <span className="text-sm">
                    {b.counts.new} new · {b.counts.known} known{b.tag ? ` · ${b.tag}` : ""}
                  </span>
                  <span className="text-xs text-muted">{new Date(b.createdAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Photo</h2>
        <p className="mb-3 text-sm text-muted">Textbook page, book page, sign, or menu. Mixed English/German glosses are fine.</p>
        <input
          className="mb-3 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm"
          placeholder="Page reference (optional), e.g. Aula 1 p. 23"
          value={pageRef}
          onChange={(e) => setPageRef(e.target.value)}
        />
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" disabled={!hasKey || !!busy} onClick={() => cameraInput.current?.click()}>
            Take photo
          </Button>
          <Button className="flex-1" disabled={!hasKey || !!busy} onClick={() => fileInput.current?.click()}>
            Choose image
          </Button>
        </div>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ""; }} />
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ""; }} />
      </Card>

      <PromptBuilderCard
        getContext={builderContext}
        onCopied={(built) => setTag(built.tag)}
        paste={paste}
        setPaste={setPaste}
        onImport={() => void onPaste()}
        busy={!!busy}
        importedTag={pastedTag}
      />

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Text</h2>
        <textarea
          className="mb-3 h-24 w-full rounded-xl bg-surface-2 p-3 text-sm"
          placeholder="Paste Spanish text: an article, a dialogue, subtitle lines"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button variant="primary" className="w-full" disabled={!hasKey || !text.trim() || !!busy} onClick={() => void onText()}>
          Extract vocabulary
        </Button>
      </Card>

      <ManualAddCard hasKey={hasKey} busy={!!busy} tag={tag.trim()} onAi={onManualAi} onSave={onManualSave} />

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Translate log (Shortcuts)</h2>
        <p className="mb-3 text-sm text-muted">
          The file the lock-screen Shortcuts write: iCloud Drive › Kurzbefehle › vocab-import › translate-log.txt. New lines become lookups and go
          straight into a drafts table.
        </p>
        <Button className="w-full" disabled={!!busy} onClick={() => logInput.current?.click()}>
          Choose translate-log.txt
        </Button>
        <input ref={logInput} type="file" accept=".jsonl,.txt,.json,text/plain,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onTranslateLog(f); e.target.value = ""; }} />
      </Card>

    </Screen>
  );
}
