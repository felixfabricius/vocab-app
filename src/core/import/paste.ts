/**
 * Parsers for the paste-import path: the JSON block the Claude app produces
 * from the copied extraction prompt (`VOCABAPP-IMPORT v2`, and v1 from the web
 * phase), and plain `spanish<TAB>english` lines.
 */
import { EntryDraftSchema, LegacyEntryDraftSchema, normalizeDraft, normalizeLegacyDraft } from "@/llm/schema";
import { ACCEPTED_MARKERS, PASTE_HEADER } from "@/llm/prompts/extract";
import type { EntryDraft } from "@/core/types";

export interface ParseResult {
  items: EntryDraft[];
  errors: { index: number; message: string }[];
  notes?: string;
  /** batch-level tag from a v2 block */
  tag?: string;
  /** items dropped because the block's `limit` was exceeded (the model lost count) */
  truncated?: number;
}

/** Find the first JSON object in the text: inside a ```json fence if present, else the outermost braces. */
export function extractJsonBlock(text: string): string | undefined {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return undefined;
}

export function parsePasteImport(text: string): ParseResult {
  const block = extractJsonBlock(text);
  if (!block) return { items: [], errors: [{ index: -1, message: "No JSON block found in the pasted text." }] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch (e) {
    return { items: [], errors: [{ index: -1, message: `Invalid JSON: ${(e as Error).message}` }] };
  }
  const obj = parsed as { marker?: unknown; items?: unknown; notes?: unknown; tag?: unknown; limit?: unknown };
  let rawItems = Array.isArray(obj.items) ? obj.items : Array.isArray(parsed) ? (parsed as unknown[]) : undefined;
  if (!rawItems) return { items: [], errors: [{ index: -1, message: "JSON has no `items` array." }] };
  const result: ParseResult = { items: [], errors: [] };
  // The prompt asked for at most `limit` items, most useful first; enforce it here.
  if (typeof obj.limit === "number" && obj.limit > 0 && rawItems.length > obj.limit) {
    result.truncated = rawItems.length - obj.limit;
    rawItems = rawItems.slice(0, obj.limit);
  }
  if (typeof obj.marker === "string" && !ACCEPTED_MARKERS.includes(obj.marker)) {
    result.errors.push({ index: -1, message: `Unexpected marker ${obj.marker}; expected ${PASTE_HEADER}. Trying anyway.` });
  }
  if (typeof obj.notes === "string" && obj.notes.trim()) result.notes = obj.notes.trim();
  if (typeof obj.tag === "string" && obj.tag.trim()) result.tag = obj.tag.trim();
  rawItems.forEach((raw, index) => {
    const legacy = isLegacyItem(raw);
    const r = legacy ? LegacyEntryDraftSchema.safeParse(withDefaults(raw, true)) : EntryDraftSchema.safeParse(withDefaults(raw, false));
    if (r.success) result.items.push(legacy ? normalizeLegacyDraft(r.data as never) : normalizeDraft(r.data as never));
    else result.errors.push({ index, message: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  });
  return result;
}

/** v1 items carry `sourceSentence` / `generatedSentence`; v2 items carry `sentence`. */
function isLegacyItem(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return !("sentence" in o) && ("sourceSentence" in o || "generatedSentence" in o);
}

/** Tolerate omitted nullable fields in hand-edited or model-abbreviated JSON. */
function withDefaults(raw: unknown, legacy: boolean): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const sentenceKeys = legacy ? ["sourceSentence", "generatedSentence"] : ["sentence", "sentenceSource"];
  for (const k of ["gender", "article", "plural", "cefr", "usefulness", "note", "irregular", "pageRef", ...sentenceKeys]) {
    if (!(k in o)) o[k] = null;
  }
  if (!("fromSentence" in o)) o.fromSentence = [];
  if (!("isPhrase" in o)) o.isPhrase = o.pos === "phrase";
  if (!("regional" in o)) o.regional = "neutral";
  if (!("priority" in o)) o.priority = "standard";
  if (typeof o.senses === "string") o.senses = [{ gloss: o.senses, reflexive: null }];
  if (Array.isArray(o.senses)) {
    o.senses = o.senses.map((s) => (typeof s === "string" ? { gloss: s, reflexive: null } : { reflexive: null, ...(s as object) }));
  }
  for (const k of legacy ? ["sourceSentence", "generatedSentence"] : ["sentence"]) {
    const s = o[k];
    if (s && typeof s === "object") {
      const so: Record<string, unknown> = { target: null, span: null, ...(s as Record<string, unknown>) };
      if (k !== "sourceSentence" && !("verbForm" in so)) so.verbForm = null;
      o[k] = so;
    }
  }
  if (!legacy && o.sentence && !o.sentenceSource) o.sentenceSource = "generated";
  if (Array.isArray(o.fromSentence)) {
    o.fromSentence = o.fromSentence.map((f) => ({ target: null, ...(f as object) }));
  }
  return o;
}

/** `spanish<TAB>english` or `spanish - english` per line. */
export function parseTsvLines(text: string): ParseResult {
  const result: ParseResult = { items: [], errors: [] };
  text.split(/\r?\n/).forEach((line, index) => {
    const raw = line.trim();
    if (!raw) return;
    const parts = raw.includes("\t") ? raw.split("\t") : raw.split(/\s+[-–—]\s+/);
    const es = parts[0]?.trim();
    const en = parts.slice(1).join(" ").trim();
    if (!es || !en) {
      result.errors.push({ index, message: `Line ${index + 1}: expected "spanish<TAB>english"` });
      return;
    }
    const isPhrase = es.split(/\s+/).length > 1;
    result.items.push({
      lemma: es,
      pos: isPhrase ? "phrase" : "other",
      isPhrase,
      senses: [{ gloss: en }],
      priority: "standard",
      regional: "neutral",
      fromSentence: [],
    });
  });
  return result;
}
