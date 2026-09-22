/**
 * Translate lookups → drafts table. Every lookup (in-app or from the Shortcuts
 * log) is stored as a `Lookup` row; "Create cards from lookups" gathers the
 * unconsumed ones into one batch and enriches the drafts with Claude when a key
 * exists (SPEC-NATIVE §4a).
 */
import { newId, nowIso } from "@/core/ids";
import { loadFrequency } from "@/core/priority/frequency";
import type { EntryDraft, Lookup } from "@/core/types";
import type { LlmEnv } from "@/llm/client";
import type { DraftContext } from "@/llm/pipelines";
import type { Repository } from "@/storage/Repository";
import { createBatch } from "@/features/import/importService";
import { enrichBatchDrafts, type JobOptions } from "@/features/entries/enrichService";

export function newLookup(o: { dir: Lookup["dir"]; src: string; dst: string; provider: Lookup["provider"]; draft?: EntryDraft; at?: string }): Lookup {
  return {
    id: newId(),
    at: o.at ?? nowIso(),
    dir: o.dir,
    src: o.src.trim(),
    dst: o.dst.trim(),
    provider: o.provider,
    ...(o.draft ? { draft: o.draft } : {}),
  };
}

/**
 * Minimal draft for one lookup: the Spanish side becomes the lemma, the English
 * side the gloss. Whole sentences become phrase drafts too (SPEC-NATIVE §4a: every
 * lookup becomes a draft; unwanted rows are swiped away in the table).
 */
export function draftFromLookupRow(r: { dir: "en-es" | "es-en"; src: string; dst: string }): EntryDraft | undefined {
  const es = (r.dir === "en-es" ? r.dst : r.src).replace(/[.!?¡¿]+$/g, "").trim();
  const en = (r.dir === "en-es" ? r.src : r.dst).replace(/[.!?]+$/g, "").trim();
  if (!es || !en) return undefined;
  const words = es.split(/\s+/).length;
  return {
    lemma: es,
    pos: words > 1 ? "phrase" : "other",
    isPhrase: words > 1,
    senses: [{ gloss: en }],
    priority: "standard",
    regional: "neutral",
    fromSentence: [],
  };
}

/** The stored Claude draft wins; otherwise a minimal draft from the two sides. */
export function draftFromLookup(l: Lookup): EntryDraft | undefined {
  if (l.draft) return l.draft;
  return draftFromLookupRow(l);
}

export interface LookupsResult {
  batchId?: string;
  lookups: number;
  drafts: number;
  enriched: number;
  usd: number;
}

export async function createCardsFromLookups(repo: Repository, env: LlmEnv | undefined, ctx: DraftContext | undefined, job: JobOptions = {}): Promise<LookupsResult> {
  const rows = await repo.listLookups({ unconsumed: true });
  const result: LookupsResult = { lookups: rows.length, drafts: 0, enriched: 0, usd: 0 };
  if (rows.length === 0) return result;

  const drafts: EntryDraft[] = [];
  const seen = new Set<string>();
  for (const l of [...rows].reverse()) {
    const d = draftFromLookup(l);
    if (!d) continue;
    const key = d.lemma.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    drafts.push(d);
  }
  const at = nowIso();
  const batch = await createBatch(repo, {
    sourceType: "lookups",
    label: `Lookups ${new Date().toLocaleDateString()}`,
    drafts,
    frequency: await loadFrequency(),
  });
  await repo.markLookupsConsumed(rows.map((r) => r.id), batch.id, at);
  result.batchId = batch.id;
  result.drafts = drafts.length;
  job.onBatch?.(batch.id);

  if (env && ctx && ctx.settings.anthropicKey) {
    const r = await enrichBatchDrafts(repo, env, ctx, batch.id, job);
    result.enriched = r.enriched;
    result.usd = r.usd;
  }
  return result;
}
