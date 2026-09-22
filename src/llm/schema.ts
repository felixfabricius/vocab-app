/**
 * Zod schemas for everything the model returns. These are the single source of
 * truth for both the API path (structured outputs) and the paste-import path.
 * Optional values are modelled as nullable so structured outputs can express
 * them; `normalizeDraft` turns nulls back into undefined.
 */
import { z } from "zod";
import type { EntryDraft } from "@/core/types";

export const PosSchema = z.enum(["noun", "verb", "adj", "adv", "phrase", "prep", "conj", "pron", "interj", "num", "other"]);
export const PrioritySchema = z.enum(["essential", "core", "standard", "niche"]);
export const CefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const RegionalSchema = z.enum(["neutral", "chile"]); // VARIETY

// A fixed-length array rather than z.tuple: tuples emit `"items": false`, a boolean
// sub-schema that the Anthropic SDK's schema transformer rejects.
const SpanSchema = z.array(z.number().int().min(0)).min(2).max(2).nullable();

export const SentenceOutSchema = z.object({
  es: z.string(),
  en: z.string(),
  /** the target as it appears in `es`, used to compute the highlight span */
  target: z.string().nullable(),
  span: SpanSchema,
});

export const GeneratedSentenceSchema = SentenceOutSchema.extend({
  verbForm: z.string().nullable(),
});

export const FromSentenceSchema = z.object({
  lemma: z.string(),
  pos: PosSchema,
  gloss: z.string(),
  target: z.string().nullable(),
});

const DraftBaseSchema = z.object({
  lemma: z.string(),
  pos: PosSchema,
  isPhrase: z.boolean(),
  gender: z.enum(["m", "f"]).nullable(),
  article: z.string().nullable(),
  plural: z.string().nullable(),
  senses: z.array(z.object({ gloss: z.string(), reflexive: z.boolean().nullable() })).min(1),
  priority: PrioritySchema,
  cefr: CefrSchema.nullable(),
  usefulness: z.number().int().min(1).max(5).nullable(),
  regional: RegionalSchema,
  note: z.string().nullable(),
  irregular: z.boolean().nullable(),
  fromSentence: z.array(FromSentenceSchema),
  pageRef: z.string().nullable(),
});

/**
 * Wire format v2 (API and `VOCABAPP-IMPORT v2`): one sentence per item, copied
 * from the source when the item occurred there, otherwise generated.
 */
export const EntryDraftSchema = DraftBaseSchema.extend({
  sentence: GeneratedSentenceSchema.nullable(),
  sentenceSource: z.enum(["source", "generated"]).nullable(),
});
export type EntryDraftOut = z.infer<typeof EntryDraftSchema>;

/** Wire format v1 (`VOCABAPP-IMPORT v1`, the web phase): source and generated sentences as two fields. */
export const LegacyEntryDraftSchema = DraftBaseSchema.extend({
  sourceSentence: SentenceOutSchema.nullable(),
  generatedSentence: GeneratedSentenceSchema.nullable(),
});
export type LegacyEntryDraftOut = z.infer<typeof LegacyEntryDraftSchema>;

export const ExtractResultSchema = z.object({
  items: z.array(EntryDraftSchema),
  /** anything the model wants to tell the user (e.g. "page was mostly German") */
  notes: z.string().nullable(),
});
export type ExtractResult = z.infer<typeof ExtractResultSchema>;

export const ScanCandidateSchema = z.object({
  lemma: z.string(),
  pos: PosSchema,
  isPhrase: z.boolean(),
  gloss: z.string(),
  priority: PrioritySchema,
  lineIndex: z.number().int().min(0),
});
export const ScanResultSchema = z.object({ candidates: z.array(ScanCandidateSchema) });
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const TranslateResultSchema = z.object({
  translation: z.string(),
  alternatives: z.array(z.string()),
  note: z.string().nullable(),
  draft: EntryDraftSchema.nullable(),
});
export type TranslateResult = z.infer<typeof TranslateResultSchema>;

function spanOf(es: string, target: string | null, span: number[] | null): [number, number] | undefined {
  const a = span?.[0];
  const b = span?.[1];
  if (a !== undefined && b !== undefined && b > a && b <= es.length && es.slice(a, b).trim().length > 0) return [a, b];
  if (target) {
    const i = es.toLowerCase().indexOf(target.toLowerCase());
    if (i >= 0) return [i, i + target.length];
  }
  return undefined;
}

type WireSentence = z.infer<typeof GeneratedSentenceSchema>;
type WireFrom = z.infer<typeof FromSentenceSchema>;

function normalizeBase(d: z.infer<typeof DraftBaseSchema>): EntryDraft {
  const out: EntryDraft = {
    lemma: d.lemma.trim(),
    pos: d.pos,
    isPhrase: d.isPhrase || d.pos === "phrase",
    senses: d.senses.map((s) => ({ gloss: s.gloss.trim(), ...(s.reflexive ? { reflexive: true } : {}) })),
    priority: d.priority,
    regional: d.regional,
    fromSentence: [],
  };
  if (d.gender) out.gender = d.gender;
  if (d.article) out.article = d.article;
  if (d.plural) out.plural = d.plural;
  if (d.cefr) out.cefr = d.cefr;
  if (d.usefulness != null) out.usefulness = d.usefulness;
  if (d.note) out.note = d.note;
  if (d.irregular != null || d.pos === "verb") out.verb = { irregular: d.irregular ?? false };
  if (d.pageRef) out.pageRef = d.pageRef;
  return out;
}

function fromSentenceWithSpans(es: string, items: WireFrom[]): EntryDraft["fromSentence"] {
  return items.map((f) => {
    const fs = spanOf(es, f.target, null);
    return { lemma: f.lemma.trim(), pos: f.pos, gloss: f.gloss.trim(), ...(fs ? { span: fs } : {}) };
  });
}

function sentenceWithSpan(s: WireSentence) {
  const span = spanOf(s.es, s.target, s.span);
  return { es: s.es, en: s.en, ...(span ? { span } : {}), ...(s.verbForm ? { verbForm: s.verbForm } : {}) };
}

/** v2 wire item → internal draft (`sourceSentence` / `generatedSentence` by `sentenceSource`). */
export function normalizeDraft(d: EntryDraftOut): EntryDraft {
  const out = normalizeBase(d);
  if (d.sentence) {
    const s = sentenceWithSpan(d.sentence);
    if (d.sentenceSource === "source") {
      const { verbForm: _v, ...src } = s;
      out.sourceSentence = src;
    } else {
      out.generatedSentence = s;
    }
    out.fromSentence = fromSentenceWithSpans(d.sentence.es, d.fromSentence);
  }
  return out;
}

/** v1 wire item → internal draft; both sentences are kept when present. */
export function normalizeLegacyDraft(d: LegacyEntryDraftOut): EntryDraft {
  const out = normalizeBase(d);
  if (d.sourceSentence) {
    const { verbForm: _v, ...src } = sentenceWithSpan({ ...d.sourceSentence, verbForm: null });
    out.sourceSentence = src;
  }
  if (d.generatedSentence) {
    out.generatedSentence = sentenceWithSpan(d.generatedSentence);
    out.fromSentence = fromSentenceWithSpans(d.generatedSentence.es, d.fromSentence);
  } else if (d.sourceSentence) {
    out.fromSentence = fromSentenceWithSpans(d.sourceSentence.es, d.fromSentence);
  }
  return out;
}
