import type { Suggestion } from "@/core/types";
import { priorityClass } from "@/features/entries/EntriesScreen";
import { cancelJob, type JobState } from "@/app/jobs";
import { SwipeRow } from "./SwipeRow";

/**
 * One flat table for every multi-card job: front (English) and back (Spanish),
 * class chip, status icon. Swipe a row to remove it, tap to edit. Group
 * membership is stored on the suggestion but not shown.
 */
export function DraftsTable({ rows, onRemove, onEdit }: { rows: Suggestion[]; onRemove: (s: Suggestion) => void; onEdit: (s: Suggestion) => void }) {
  if (rows.length === 0) return <p className="p-4 text-center text-sm text-muted">No drafts left.</p>;
  return (
    <ul className="divide-y divide-surface-2 overflow-hidden rounded-2xl bg-surface">
      {rows.map((s) => (
        <SwipeRow key={s.id} onRemove={() => onRemove(s)} onTap={() => onEdit(s)}>
          <DraftRow s={s} />
        </SwipeRow>
      ))}
    </ul>
  );
}

function StatusIcon({ s }: { s: Suggestion }) {
  if (s.existingEntryId) return <span title="already in your collection" className="text-accent">✓</span>;
  if (s.didYouMean) return <span title={`did you mean ${s.didYouMean}?`} className="text-easy">?</span>;
  return <span className="text-good">●</span>;
}

function DraftRow({ s }: { s: Suggestion }) {
  const d = s.draft;
  const sentence = d.sourceSentence ?? d.generatedSentence;
  const back = `${d.article ? `${d.article} ` : ""}${d.lemma}`;
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="w-4 pt-0.5 text-center text-sm">
        <StatusIcon s={s} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-muted">{d.senses.map((x) => x.gloss).join("; ")}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${priorityClass(d.priority)}`}>{d.priority}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{back}</span>
          <span className="text-[10px] uppercase text-muted">{d.pos}</span>
          {d.regional === "chile" && <span className="text-[10px] text-easy">chileno</span>}
        </div>
        {sentence && <div className="mt-0.5 truncate text-xs text-muted/80">{sentence.es}</div>}
        {s.didYouMean && !s.existingEntryId && <div className="text-xs text-easy">did you mean “{s.didYouMean}”?</div>}
      </div>
    </div>
  );
}

export function JobBar({ job }: { job: JobState }) {
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : undefined;
  const running = job.status === "running";
  return (
    <div className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={running ? "text-accent" : job.status === "failed" ? "text-again" : "text-muted"}>
          {running ? `${job.label}…` : job.message ?? `${job.label} ${job.status}`}
          {running && pct !== undefined ? ` ${job.done}/${job.total}` : ""}
        </span>
        {running && (
          <button className="rounded-md bg-surface px-3 py-1 text-xs" onClick={() => cancelJob(job.id)}>
            Cancel
          </button>
        )}
      </div>
      {running && (
        <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface">
          <div className={`h-full bg-accent ${pct === undefined ? "w-1/3 animate-pulse" : ""}`} style={pct !== undefined ? { width: `${pct}%` } : undefined} />
        </div>
      )}
    </div>
  );
}
