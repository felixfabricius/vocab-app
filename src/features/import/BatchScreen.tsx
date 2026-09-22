import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, Card, Screen, Spinner } from "@/app/components/ui";
import { repo } from "@/app/services";
import { runJob, useJob } from "@/app/jobs";
import type { ImportBatch, Suggestion } from "@/core/types";
import { acceptBatch, ignoreSuggestion } from "./importService";
import { enrichEntryIds } from "@/features/entries/enrichService";
import { draftContext, llmEnv } from "@/app/llmEnv";
import { SuggestionEditor } from "./SuggestionEditor";
import { DraftsTable, JobBar } from "./DraftsTable";

export function BatchScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const [batch, setBatch] = useState<ImportBatch | undefined>();
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [editing, setEditing] = useState<Suggestion | undefined>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | undefined>();
  const [bare, setBare] = useState<string[] | undefined>();
  const job = useJob(id);

  const load = useCallback(async () => {
    if (!id) return;
    const [b, s] = await Promise.all([repo.getBatch(id), repo.suggestionsForBatch(id)]);
    setBatch(b);
    setRows(s);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // A running job for this batch rewrites rows as chunks complete; refresh on every progress tick.
  useEffect(() => {
    if (job) void load();
  }, [job?.done, job?.status, load, job]);

  if (!id) return null;
  if (!batch) return <Spinner />;

  const open = rows.filter((r) => !r.decision && r.checked);
  const known = open.filter((r) => r.existingEntryId).length;

  async function remove(s: Suggestion) {
    const next: Suggestion = { ...s, checked: false, decision: "excluded" };
    setRows((rs) => rs.map((r) => (r.id === s.id ? next : r)));
    await repo.putSuggestions([next]);
  }

  async function never(s: Suggestion) {
    setEditing(undefined);
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

  function enrich() {
    if (!bare) return;
    const ids = bare;
    setBare(undefined);
    const handle = runJob({
      label: "Enriching with Claude",
      batchId: id,
      task: async (signal, progress) => enrichEntryIds(repo, llmEnv, await draftContext(), ids, { signal, onProgress: progress }),
      summary: (r) => `${r.enriched} enriched, ${r.sentencesAdded} sentences added ($${r.usd.toFixed(3)})`,
    });
    void handle.result.then((r) => {
      if (r?.childBatchId) nav(`/import/batch/${r.childBatchId}`);
    });
  }

  async function discard() {
    if (!window.confirm("Discard this batch?")) return;
    await repo.deleteBatch(id!);
    nav("/import");
  }

  return (
    <Screen
      title="Drafts"
      right={
        <button className="text-sm text-muted" onClick={() => nav("/import")}>
          Close
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {open.length} rows{known ? ` · ${known} known` : ""}
        {batch.tag ? ` · tag ${batch.tag}` : ""}
        <span className="block text-xs">Swipe a row to remove it, tap to edit.</span>
      </p>
      {job && <JobBar job={job} />}
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
                <Button variant="primary" className="flex-[2]" disabled={busy} onClick={enrich}>
                  Enrich {bare.length} with Claude
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted">This batch has been processed.</p>
          )}
        </Card>
      ) : (
        <>
          <DraftsTable rows={open} onRemove={(s) => void remove(s)} onEdit={setEditing} />
          <div className="sticky bottom-20 mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => void discard()}>
              Discard
            </Button>
            <Button variant="primary" className="flex-[2]" disabled={busy || open.length === 0 || job?.status === "running"} onClick={() => void accept()}>
              {busy ? "Saving…" : `Accept all (${open.length})`}
            </Button>
          </div>
        </>
      )}

      {editing && (
        <SuggestionEditor
          draft={editing.draft}
          onCancel={() => setEditing(undefined)}
          onSave={(d) => void saveEdit(editing, d)}
          onNever={() => void never(editing)}
        />
      )}
    </Screen>
  );
}
