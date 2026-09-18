import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, Card, Screen, Spinner } from "@/app/components/ui";
import { repo } from "@/app/services";
import type { ImportBatch, Suggestion, SuggestionGroup } from "@/core/types";
import { priorityClass } from "@/features/entries/EntriesScreen";
import { acceptBatch, ignoreSuggestion } from "./importService";
import { enrichEntryIds } from "@/features/entries/enrichService";
import { draftContext, llmEnv } from "@/app/llmEnv";
import { SuggestionEditor } from "./SuggestionEditor";

const GROUPS: { id: SuggestionGroup; label: string }[] = [
  { id: "words", label: "Words" },
  { id: "phrases", label: "Phrases" },
  { id: "fromSentences", label: "From example sentences" },
];

export function BatchScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const [batch, setBatch] = useState<ImportBatch | undefined>();
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [editing, setEditing] = useState<Suggestion | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
  const [bare, setBare] = useState<string[] | undefined>();

  const load = useCallback(async () => {
    if (!id) return;
    const [b, s] = await Promise.all([repo.getBatch(id), repo.suggestionsForBatch(id)]);
    setBatch(b);
    setRows(s);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;
  if (!batch) return <Spinner />;

  const open = rows.filter((r) => !r.decision);
  const checkedCount = open.filter((r) => r.checked).length;

  async function toggle(s: Suggestion) {
    const next = { ...s, checked: !s.checked };
    setRows((rs) => rs.map((r) => (r.id === s.id ? next : r)));
    await repo.putSuggestions([next]);
  }

  async function exclude(s: Suggestion) {
    const next: Suggestion = { ...s, checked: false, decision: "excluded" };
    setRows((rs) => rs.map((r) => (r.id === s.id ? next : r)));
    await repo.putSuggestions([next]);
  }

  async function ignore(s: Suggestion) {
    if (!window.confirm(`Never suggest "${s.draft.lemma}" again?`)) return;
    await ignoreSuggestion(repo, s);
    await load();
  }

  async function saveEdit(s: Suggestion, draft: Suggestion["draft"]) {
    const next = { ...s, draft, checked: true };
    setEditing(undefined);
    setRows((rs) => rs.map((r) => (r.id === s.id ? next : r)));
    await repo.putSuggestions([next]);
  }

  async function accept() {
    setBusy(true);
    try {
      const r = await acceptBatch(repo, id!);
      setMsg(`${r.created} entries created, ${r.attached} existing entries updated`);
      await load();
      if (r.bareIds.length > 0) setBare(r.bareIds);
      else setTimeout(() => nav("/import"), 800);
    } catch (e) {
      setMsg(`Accept failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function enrich() {
    if (!bare) return;
    setBusy(true);
    try {
      const ctx = await draftContext();
      const r = await enrichEntryIds(repo, llmEnv, ctx, bare);
      setMsg(`${r.enriched} entries enriched, ${r.sentencesAdded} sentences added ($${r.usd.toFixed(3)})`);
      setBare(undefined);
      if (r.childBatchId) setTimeout(() => nav(`/import/batch/${r.childBatchId}`), 800);
      else setTimeout(() => nav("/import"), 800);
    } catch (e) {
      setMsg(`Enrich failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm("Discard this batch?")) return;
    await repo.deleteBatch(id!);
    nav("/import");
  }

  return (
    <Screen
      title="Suggestions"
      right={
        <button className="text-sm text-muted" onClick={() => nav("/import")}>
          Close
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {batch.counts.found} found · {batch.counts.known} already known · {batch.counts.new} new
      </p>
      {msg && <div className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">{msg}</div>}

      {batch.stage === "done" ? (
        <Card>
          {bare && bare.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-muted">{bare.length} new entries have no example sentence yet. Claude can add sentences, gender, notes and priority.</p>
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => nav("/import")}>
                  Later
                </Button>
                <Button variant="primary" className="flex-[2]" disabled={busy} onClick={() => void enrich()}>
                  {busy ? "Enriching…" : `Enrich ${bare.length} with Claude`}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted">This batch has been processed.</p>
          )}
        </Card>
      ) : (
        <>
          {GROUPS.map((g) => {
            const list = open.filter((r) => r.group === g.id);
            if (list.length === 0) return null;
            return (
              <Card key={g.id} className="mb-4">
                <h2 className="mb-2 font-medium">
                  {g.label} <span className="text-sm text-muted">({list.length})</span>
                </h2>
                <ul className="divide-y divide-surface-2">
                  {list.map((s) => (
                    <SuggestionRow key={s.id} s={s} onToggle={() => void toggle(s)} onEdit={() => setEditing(s)} onExclude={() => void exclude(s)} onIgnore={() => void ignore(s)} />
                  ))}
                </ul>
              </Card>
            );
          })}

          <div className="sticky bottom-20 flex gap-2">
            <Button className="flex-1" onClick={() => void discard()}>
              Discard
            </Button>
            <Button variant="primary" className="flex-[2]" disabled={busy || checkedCount === 0} onClick={() => void accept()}>
              {busy ? "Saving…" : `Accept ${checkedCount} checked`}
            </Button>
          </div>
        </>
      )}

      {editing && <SuggestionEditor draft={editing.draft} onCancel={() => setEditing(undefined)} onSave={(d) => void saveEdit(editing, d)} />}
    </Screen>
  );
}

function SuggestionRow({ s, onToggle, onEdit, onExclude, onIgnore }: { s: Suggestion; onToggle: () => void; onEdit: () => void; onExclude: () => void; onIgnore: () => void }) {
  const d = s.draft;
  const sentence = d.sourceSentence ?? d.generatedSentence;
  return (
    <li className="flex items-start gap-3 py-3">
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-accent)]" checked={s.checked} onChange={onToggle} />
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{d.article ? `${d.article} ` : ""}{d.lemma}</span>
          <span className="text-xs text-muted">{d.pos}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${priorityClass(d.priority)}`}>{d.priority}</span>
          {d.regional === "chile" && <span className="text-[10px] text-easy">chileno</span>}
          {s.existingEntryId && <span className="text-[10px] text-accent">known</span>}
        </div>
        <div className="text-sm text-muted">{d.senses.map((x) => x.gloss).join("; ")}</div>
        {sentence && <div className="mt-0.5 truncate text-xs text-muted/80">{sentence.es}</div>}
        {s.didYouMean && <div className="mt-0.5 text-xs text-easy">did you mean “{s.didYouMean}”?</div>}
      </button>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <button className="px-2 py-1" onClick={onExclude}>✕</button>
        <button className="px-2 py-1" onClick={onIgnore} title="Never suggest again">never</button>
      </div>
    </li>
  );
}
