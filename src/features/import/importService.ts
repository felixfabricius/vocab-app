/**
 * Turns drafts into inbox suggestions, and accepted suggestions into entries,
 * senses, sentences, encounters and cards. Storage-agnostic (uses Repository).
 */
import { newId, nowIso } from "@/core/ids";
import { LANGUAGE } from "@/config/language";
import { buildDedupeIndex, didYouMean, findExact, entryKey } from "@/core/dedupe";
import { missingProductionCards } from "@/core/generator/cards";
import { priorityFromRank } from "@/core/priority/rank";
import type {
  Card,
  Encounter,
  Entry,
  EntryDraft,
  ImportBatch,
  Sense,
  Sentence,
  Source,
  SourceType,
  Suggestion,
} from "@/core/types";
import type { Repository } from "@/storage/Repository";
import { ensureParadigmCards } from "@/features/grammar/tenseService";

export interface CreateBatchInput {
  sourceType: SourceType;
  label: string;
  pageRef?: string;
  imageHash?: string;
  /** one tag for the whole batch, written on every entry it creates or touches */
  tag?: string;
  drafts: EntryDraft[];
  /** lemma -> frequency rank, when available */
  frequency?: Map<string, number>;
}

export async function createBatch(repo: Repository, input: CreateBatchInput): Promise<ImportBatch> {
  const at = nowIso();
  const source: Source = {
    id: newId(),
    type: input.sourceType,
    label: input.label,
    ...(input.pageRef ? { pageRef: input.pageRef } : {}),
    ...(input.imageHash ? { imageHash: input.imageHash } : {}),
    createdAt: at,
  };
  await repo.putSource(source);

  const [entries, ignore] = await Promise.all([repo.allActiveEntriesById(), repo.ignoreKeys()]);
  const index = buildDedupeIndex(entries.values());
  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();
  let known = 0;

  const push = (draft: EntryDraft, group: Suggestion["group"], parentId?: string) => {
    const key = entryKey(draft.lemma, draft.pos);
    if (seen.has(key)) return;
    seen.add(key);
    if (ignore.has(key)) return;
    const existing = findExact(index, draft.lemma, draft.pos);
    if (existing) known++;
    const hint = existing ? undefined : didYouMean(index, draft.lemma, draft.pos);
    const rank = input.frequency?.get(draft.lemma.toLowerCase());
    if (rank !== undefined && !draft.isPhrase) {
      draft.frequencyRank = rank;
      draft.priority = priorityFromRank(rank);
    }
    // Every row starts checked (known ones too: accepting attaches the sentence or a new sense);
    // the drafts table is "swipe away what you do not want, then Accept all".
    const checked = true;
    suggestions.push({
      id: newId(),
      batchId: "",
      group,
      draft,
      checked,
      ...(existing ? { existingEntryId: existing.id } : {}),
      ...(hint ? { didYouMean: hint.lemma } : {}),
      ...(parentId ? { parentSuggestionId: parentId } : {}),
      createdAt: at,
    });
  };

  for (const draft of input.drafts) {
    const parentId = newId();
    const group = draft.isPhrase ? "phrases" : "words";
    push(draft, group);
    const parent = suggestions[suggestions.length - 1];
    const parentSid = parent && parent.draft === draft ? parent.id : parentId;
    // From-sentence words reuse the parent's sentence (generated, or the source sentence in v2 blocks).
    const parentSentence = draft.generatedSentence ?? draft.sourceSentence;
    if (parentSentence) {
      for (const f of draft.fromSentence) {
        const child: EntryDraft = {
          lemma: f.lemma,
          pos: f.pos,
          isPhrase: false,
          senses: [{ gloss: f.gloss }],
          priority: "standard",
          regional: "neutral",
          fromSentence: [],
          sourceSentence: { es: parentSentence.es, en: parentSentence.en, ...(f.span ? { span: f.span } : {}) },
        };
        push(child, "fromSentences", parentSid);
      }
    }
  }

  const tag = input.tag?.trim();
  const batch: ImportBatch = {
    id: newId(),
    sourceId: source.id,
    ...(tag ? { tag } : {}),
    stage: "drafted",
    counts: { found: input.drafts.length, known, new: suggestions.filter((s) => !s.existingEntryId).length },
    createdAt: at,
    updatedAt: at,
  };
  for (const s of suggestions) s.batchId = batch.id;
  await repo.putBatch(batch);
  await repo.putSuggestions(suggestions);
  return batch;
}

export interface AcceptResult {
  created: number;
  attached: number;
  /** ids of newly created entries */
  createdIds: string[];
  /** created single-word entries that have no sentence (candidates for enrichment); phrases are their own example */
  bareIds: string[];
}

/** Create entries for every checked, undecided suggestion in the batch; attach encounters to existing entries. */
export async function acceptBatch(repo: Repository, batchId: string): Promise<AcceptResult> {
  const batch = await repo.getBatch(batchId);
  if (!batch) throw new Error("Batch not found");
  const suggestions = (await repo.suggestionsForBatch(batchId)).filter((s) => !s.decision);
  const at = nowIso();
  const env = { now: () => new Date(), newId };
  const entriesById = await repo.allActiveEntriesById();
  const index = buildDedupeIndex(entriesById.values());

  const newEntries: Entry[] = [];
  const newSenses: Sense[] = [];
  const newSentences: Sentence[] = [];
  const newEncounters: Encounter[] = [];
  const newCards: Card[] = [];
  const sentenceByText = new Map<string, Sentence>();
  const updated: Suggestion[] = [];
  const taggedExisting = new Map<string, Entry>();
  let created = 0;
  let attached = 0;

  const sentenceFor = (es: string, en: string, origin: Sentence["origin"]): Sentence => {
    const key = es.trim();
    let s = sentenceByText.get(key);
    if (!s) {
      s = { id: newId(), es: es.trim(), en: en.trim(), origin, sourceId: batch.sourceId, createdAt: at, updatedAt: at };
      sentenceByText.set(key, s);
      newSentences.push(s);
    }
    return s;
  };

  const attachSentences = (entryId: string, draft: EntryDraft) => {
    const pairs: { s: { es: string; en: string; span?: [number, number]; verbForm?: string }; origin: Sentence["origin"] }[] = [];
    if (draft.sourceSentence) pairs.push({ s: draft.sourceSentence, origin: "source" });
    if (draft.generatedSentence) pairs.push({ s: draft.generatedSentence, origin: "generated" });
    for (const { s, origin } of pairs) {
      const sentence = sentenceFor(s.es, s.en, origin);
      newEncounters.push({
        id: newId(),
        entryId,
        sentenceId: sentence.id,
        ...(s.span ? { span: s.span } : {}),
        ...(s.span ? { form: sentence.es.slice(s.span[0], s.span[1]) } : {}),
        ...("verbForm" in s && s.verbForm ? { tense: s.verbForm } : {}),
        createdAt: at,
      });
    }
  };

  // Parents first so children can reuse their sentences (sentenceFor dedupes by text anyway).
  const ordered = [...suggestions].sort((a, b) => Number(!!a.parentSuggestionId) - Number(!!b.parentSuggestionId));

  for (const s of ordered) {
    if (!s.checked) {
      updated.push({ ...s, decision: "excluded" });
      continue;
    }
    const d = s.draft;
    const existing = s.existingEntryId ? entriesById.get(s.existingEntryId) : findExact(index, d.lemma, d.pos);
    if (existing) {
      attachSentences(existing.id, d);
      // Add a genuinely new sense if none of the existing glosses overlap.
      const bundle = await repo.getBundle(existing.id);
      const glosses = (bundle?.senses ?? []).map((x) => x.gloss.toLowerCase());
      let order = bundle?.senses.length ?? 0;
      for (const sense of d.senses) {
        const g = sense.gloss.toLowerCase();
        if (glosses.some((x) => x === g || x.includes(g) || g.includes(x))) continue;
        newSenses.push({ id: newId(), entryId: existing.id, gloss: sense.gloss, order: order++, ...(sense.reflexive ? { reflexive: true } : {}), createdAt: at, updatedAt: at });
      }
      const allSenses = [...(bundle?.senses ?? []), ...newSenses.filter((x) => x.entryId === existing.id)];
      newCards.push(...missingProductionCards(existing, allSenses, bundle?.cards ?? [], env));
      if (batch.tag && !existing.tags.includes(batch.tag)) {
        taggedExisting.set(existing.id, { ...existing, tags: [...existing.tags, batch.tag], updatedAt: at });
      }
      attached++;
      updated.push({ ...s, decision: "accepted", existingEntryId: existing.id });
      continue;
    }

    const entry: Entry = {
      id: newId(),
      lang: LANGUAGE.id,
      lemma: d.lemma,
      pos: d.pos,
      isPhrase: d.isPhrase,
      ...(d.gender ? { gender: d.gender } : {}),
      ...(d.article ? { article: d.article } : {}),
      ...(d.plural ? { plural: d.plural } : {}),
      priority: d.priority,
      priorityAuto: true,
      ...(d.frequencyRank !== undefined ? { frequencyRank: d.frequencyRank } : {}),
      ...(d.cefr ? { cefr: d.cefr } : {}),
      regional: d.regional,
      ...(d.note ? { note: d.note } : {}),
      tags: batch.tag ? [batch.tag] : [],
      ...(d.pos === "verb" ? { verb: { irregular: d.verb?.irregular ?? false, paradigmCards: "auto" as const } } : {}),
      status: "active",
      sourceIds: [batch.sourceId],
      createdAt: at,
      updatedAt: at,
    };
    const senses: Sense[] = d.senses.map((sense, order) => ({
      id: newId(),
      entryId: entry.id,
      gloss: sense.gloss,
      order,
      ...(sense.reflexive ? { reflexive: true } : {}),
      createdAt: at,
      updatedAt: at,
    }));
    newEntries.push(entry);
    newSenses.push(...senses);
    attachSentences(entry.id, d);
    newCards.push(...missingProductionCards(entry, senses, [], env));
    index.byKey.set(entryKey(entry.lemma, entry.pos), entry);
    entriesById.set(entry.id, entry);
    created++;
    updated.push({ ...s, decision: "accepted", existingEntryId: entry.id });
  }

  await repo.putEntries([...newEntries, ...taggedExisting.values()]);
  await repo.putSenses(newSenses);
  await repo.putSentences(newSentences);
  await repo.putEncounters(newEncounters);
  await repo.putCards(newCards);
  await repo.putSuggestions(updated);
  await repo.putBatch({ ...batch, stage: "done", updatedAt: nowIso() });
  await ensureParadigmCards(repo, newEntries);
  const withSentence = new Set(newEncounters.map((e) => e.entryId));
  return {
    created,
    attached,
    createdIds: newEntries.map((e) => e.id),
    bareIds: newEntries.filter((e) => !withSentence.has(e.id) && !e.isPhrase).map((e) => e.id),
  };
}

export async function ignoreSuggestion(repo: Repository, s: Suggestion): Promise<void> {
  await repo.addIgnore([{ key: entryKey(s.draft.lemma, s.draft.pos), createdAt: nowIso() }]);
  await repo.putSuggestions([{ ...s, checked: false, decision: "ignored" }]);
}
