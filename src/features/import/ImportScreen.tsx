import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Screen } from "@/app/components/ui";
import { repo } from "@/app/services";
import { draftContext, llmEnv } from "@/app/llmEnv";
import { useSettings } from "@/app/useSettings";
import { parsePasteImport, parseTsvLines } from "@/core/import/paste";
import { draftsFromTranslateLog, parseTranslateLog } from "@/core/import/translateLog";
import type { ImportBatch } from "@/core/types";
import { prepareImage } from "@/llm/image";
import { draftFromImage, draftFromText, draftManual } from "@/llm/pipelines";
import { buildExtractPrompt } from "@/llm/prompts/extract";
import { createBatch } from "./importService";

type Busy = { label: string } | undefined;

export function ImportScreen() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const [busy, setBusy] = useState<Busy>();
  const [msg, setMsg] = useState<string | undefined>();
  const [paste, setPaste] = useState("");
  const [text, setText] = useState("");
  const [word, setWord] = useState("");
  const [pageRef, setPageRef] = useState("");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const logInput = useRef<HTMLInputElement>(null);

  const hasKey = !!settings?.anthropicKey;

  async function refreshBatches() {
    setBatches(await repo.listBatches());
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
        imageHash: img.hash,
        drafts: out.drafts.map((d) => (pageRef && !d.pageRef ? { ...d, pageRef } : d)),
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
      const batch = await createBatch(repo, {
        sourceType: "paste",
        label: `Paste ${new Date().toLocaleString()}`,
        ...(pageRef ? { pageRef } : {}),
        drafts: parsed.items,
      });
      const errs = parsed.errors.length ? ` (${parsed.errors.length} items skipped: ${parsed.errors.map((e) => e.message).join("; ")})` : "";
      setPaste("");
      return { batchId: batch.id, message: `${parsed.items.length} items imported${errs}` };
    });
  }

  async function onText() {
    await run("Text import", async () => {
      const ctx = await draftContext();
      const out = await draftFromText(llmEnv, ctx, text);
      if (out.drafts.length === 0) return { message: "No vocabulary found." };
      const batch = await createBatch(repo, { sourceType: "text", label: `Text ${new Date().toLocaleString()}`, drafts: out.drafts });
      setText("");
      return { batchId: batch.id, message: `${out.drafts.length} items drafted for $${out.usd.toFixed(3)}` };
    });
  }

  async function onTranslateLog(file: File) {
    await run("Translate log import", async () => {
      const parsed = parseTranslateLog(await file.text());
      const drafts = draftsFromTranslateLog(parsed.rows);
      if (drafts.length === 0) return { message: `No new items. ${parsed.errors.join("; ")}` };
      const batch = await createBatch(repo, { sourceType: "translate", label: `Translate log ${new Date().toLocaleDateString()}`, drafts });
      return { batchId: batch.id, message: `${drafts.length} items from ${parsed.rows.length} lookups` };
    });
  }

  async function onWord() {
    await run("Add word", async () => {
      const ctx = await draftContext();
      const out = await draftManual(llmEnv, ctx, word.trim());
      if (out.drafts.length === 0) return { message: "Nothing drafted." };
      const batch = await createBatch(repo, { sourceType: "manual", label: word.trim(), drafts: out.drafts });
      setWord("");
      return { batchId: batch.id, message: `Drafted for $${out.usd.toFixed(3)}` };
    });
  }

  async function copyPrompt() {
    const ctx = await draftContext();
    const prompt = buildExtractPrompt({
      format: "paste",
      chunking: ctx.settings.chunking,
      knownLemmas: ctx.knownLemmas,
      ignoreLemmas: ctx.ignoreLemmas,
      sourceHint: "a photo of a textbook or book page (attached)",
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setMsg("Prompt copied. Paste it into the Claude app together with the photo, then paste the reply below.");
    } catch {
      setMsg("Clipboard blocked; long-press the text box below to copy manually.");
      setPaste(prompt);
    }
  }

  const open = batches.filter((b) => b.stage !== "done");

  return (
    <Screen title="Import">
      {msg && <div className="mb-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{msg}</div>}
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

      {open.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-medium">Inbox</h2>
          <ul className="divide-y divide-surface-2">
            {open.map((b) => (
              <li key={b.id}>
                <button className="flex w-full items-center justify-between py-2 text-left" onClick={() => nav(`/import/batch/${b.id}`)}>
                  <span className="text-sm">
                    {b.counts.new} new · {b.counts.known} known
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

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Paste from the Claude app</h2>
        <p className="mb-3 text-sm text-muted">
          Copy the extraction prompt, send it with a photo in the Claude app, paste the reply here. Also accepts plain lines: <code>spanish ⇥ english</code>.
        </p>
        <Button className="mb-3 w-full" onClick={() => void copyPrompt()}>
          Copy extraction prompt
        </Button>
        <textarea
          className="mb-3 h-32 w-full rounded-xl bg-surface-2 p-3 text-sm"
          placeholder="Paste the reply here"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button variant="primary" className="w-full" disabled={!paste.trim() || !!busy} onClick={() => void onPaste()}>
          Import pasted text
        </Button>
      </Card>

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

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Translate log</h2>
        <p className="mb-3 text-sm text-muted">
          The file the lock-screen Shortcuts write: iCloud Drive › Shortcuts › vocab-import › translate-log.jsonl. Works without an API key.
        </p>
        <Button className="w-full" disabled={!!busy} onClick={() => logInput.current?.click()}>
          Choose translate-log.jsonl
        </Button>
        <input ref={logInput} type="file" accept=".jsonl,.txt,.json,text/plain,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onTranslateLog(f); e.target.value = ""; }} />
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Single word or phrase</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl bg-surface-2 px-3 py-2"
            placeholder="Spanish or English"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && word.trim() && void onWord()}
          />
          <Button variant="primary" disabled={!hasKey || !word.trim() || !!busy} onClick={() => void onWord()}>
            Add
          </Button>
        </div>
      </Card>
    </Screen>
  );
}
