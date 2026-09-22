/**
 * Enrich existing entries with Claude: details, a generated sentence, and
 * from-sentence suggestions. Used for entries created without sentences
 * (translate log, plain lines, scan candidates) and on demand from the editor.
 */
import { newId, nowIso } from "@/core/ids";
import { entryKey } from "@/core/dedupe";
import { missingProductionCards } from "@/core/generator/cards";
import type { Encounter, Entry, EntryDraft, Sense, Sentence } from "@/core/types";
import type { LlmEnv } from "@/llm/client";
import { enrichEntries, type DraftContext } from "@/llm/pipelines";
import type { Repository } from "@/storage/Repository";
import { createBatch } from "@/features/import/importService";
import { ensureParadigmCards } from "@/features/grammar/tenseService";

const CHUNK = 20;

export interface EnrichResult {
  enriched: number;
  sentencesAdded: number;
  childBatchId?: string;
  usd: number;
}

export interface JobOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export async function enrichEntryIds(repo: Repository, env: LlmEnv, ctx: DraftContext, entryIds: string[], job: JobOptions = {}): Promise<EnrichResult> {
  const result: EnrichResult = { enriched: 0, sentencesAdded: 0, usd: 0 };
  const children: EntryDraft[] = [];
  job.onProgress?.(0, entryIds.length);

  for (let i = 0; i < entryIds.length; i += CHUNK) {
    if (job.signal?.aborted) break;
    const ids = entryIds.slice(i, i + CHUNK);
    const bundles = (await Promise.all(ids.map((id) => repo.getBundle(id)))).filter((b): b is NonNullable<typeof b> => !!b);
    if (bundles.length === 0) continue;
    const inputs = bundles.map((b) => ({
      lemma: b.entry.lemma,
      pos: b.entry.pos,
      glosses: b.senses.map((s) => s.gloss),
      ...(b.sentences[0] ? { context: b.sentences[0].es } : {}),
    }));
    const out = await enrichEntries(env, ctx, inputs);
    result.usd += out.usd;

    // Match by position first, then by lemma+pos in case the model reordered.
    const byKey = new Map(out.drafts.map((d) => [entryKey(d.lemma, d.pos), d]));
    for (let n = 0; n < bundles.length; n++) {
      const b = bundles[n]!;
      const key = entryKey(b.entry.lemma, b.entry.pos);
      const positional = out.drafts[n];
      const draft = positional && entryKey(positional.lemma, positional.pos) === key ? positional : byKey.get(key);
      if (!draft) continue;
      await applyDraft(repo, b.entry, b.senses, b.sentences.length, draft, result, children);
    }
    job.onProgress?.(Math.min(i + CHUNK, entryIds.length), entryIds.length);
  }

  if (children.length > 0) {
    const batch = await createBatch(repo, { sourceType: "text", label: `From enriched sentences ${new Date().toLocaleDateString()}`, drafts: children });
    result.childBatchId = batch.id;
  }
  return result;
}

async function applyDraft(repo: Repository, entry: Entry, senses: Sense[], sentenceCount: number, d: EntryDraft, result: EnrichResult, children: EntryDraft[]) {
  const at = nowIso();
  const next: Entry = {
    ...entry,
    ...(d.gender && !entry.gender ? { gender: d.gender } : {}),
    ...(d.article && !entry.article ? { article: d.article } : {}),
    ...(d.plural && !entry.plural ? { plural: d.plural } : {}),
    ...(d.cefr && !entry.cefr ? { cefr: d.cefr } : {}),
    ...(d.note && !entry.note ? { note: d.note } : {}),
    regional: entry.regional === "neutral" ? d.regional : entry.regional,
    isPhrase: entry.isPhrase || d.isPhrase,
    ...(entry.priorityAuto && entry.frequencyRank === undefined ? { priority: d.priority } : {}),
    ...(entry.pos === "verb" ? { verb: { irregular: entry.verb?.irregular || (d.verb?.irregular ?? false), paradigmCards: entry.verb?.paradigmCards ?? "auto" } } : {}),
    updatedAt: at,
  };
  await repo.putEntry(next);

  // Extra senses the model found (beyond the first, which repeats the given meaning).
  const glosses = senses.map((s) => s.gloss.toLowerCase());
  const newSenses: Sense[] = [];
  let order = senses.length;
  for (const s of d.senses) {
    const g = s.gloss.toLowerCase();
    if (glosses.some((x) => x === g || x.includes(g) || g.includes(x))) continue;
    newSenses.push({ id: newId(), entryId: entry.id, gloss: s.gloss, order: order++, ...(s.reflexive ? { reflexive: true } : {}), createdAt: at, updatedAt: at });
  }
  if (newSenses.length) {
    await repo.putSenses(newSenses);
    const cards = await repo.cardsForEntry(entry.id);
    const added = missingProductionCards(next, [...senses, ...newSenses], cards, { now: () => new Date(), newId });
    if (added.length) await repo.putCards(added);
  }

  if (sentenceCount === 0 && d.generatedSentence) {
    const s = d.generatedSentence;
    const sentence: Sentence = { id: newId(), es: s.es, en: s.en, origin: "generated", createdAt: at, updatedAt: at };
    const enc: Encounter = {
      id: newId(),
      entryId: entry.id,
      sentenceId: sentence.id,
      ...(s.span ? { span: s.span, form: s.es.slice(s.span[0], s.span[1]) } : {}),
      ...(s.verbForm ? { tense: s.verbForm } : {}),
      createdAt: at,
    };
    await repo.putSentences([sentence]);
    await repo.putEncounters([enc]);
    result.sentencesAdded++;
    for (const f of d.fromSentence) {
      children.push({
        lemma: f.lemma,
        pos: f.pos,
        isPhrase: false,
        senses: [{ gloss: f.gloss }],
        priority: "standard",
        regional: "neutral",
        fromSentence: [],
        sourceSentence: { es: s.es, en: s.en, ...(f.span ? { span: f.span } : {}) },
      });
    }
  }
  if (next.pos === "verb") await ensureParadigmCards(repo, [next]);
  result.enriched++;
}
