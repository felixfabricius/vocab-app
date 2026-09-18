/**
 * Parsers for the paste-import path: the JSON block the Claude app produces
 * from the copied extraction prompt, and plain `spanish<TAB>english` lines.
 */
import { EntryDraftSchema, normalizeDraft } from "@/llm/schema";
import { PASTE_HEADER } from "@/llm/prompts/extract";
import type { EntryDraft } from "@/core/types";

export interface ParseResult {
  items: EntryDraft[];
  errors: { index: number; message: string }[];
  notes?: string;
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
  const obj = parsed as { marker?: unknown; items?: unknown; notes?: unknown };
  const rawItems = Array.isArray(obj.items) ? obj.items : Array.isArray(parsed) ? (parsed as unknown[]) : undefined;
  if (!rawItems) return { items: [], errors: [{ index: -1, message: "JSON has no `items` array." }] };
  const result: ParseResult = { items: [], errors: [] };
  if (typeof obj.marker === "string" && obj.marker !== PASTE_HEADER) {
    result.errors.push({ index: -1, message: `Unexpected marker ${obj.marker}; expected ${PASTE_HEADER}. Trying anyway.` });
  }
  if (typeof obj.notes === "string" && obj.notes.trim()) result.notes = obj.notes.trim();
  rawItems.forEach((raw, index) => {
    const r = EntryDraftSchema.safeParse(withDefaults(raw));
    if (r.success) result.items.push(normalizeDraft(r.data));
    else result.errors.push({ index, message: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  });
  return result;
}

/** Tolerate omitted nullable fields in hand-edited or model-abbreviated JSON. */
function withDefaults(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of ["gender", "article", "plural", "cefr", "usefulness", "note", "irregular", "sourceSentence", "generatedSentence", "pageRef"]) {
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
  for (const k of ["sourceSentence", "generatedSentence"]) {
    const s = o[k];
    if (s && typeof s === "object") {
      const so: Record<string, unknown> = { target: null, span: null, ...(s as Record<string, unknown>) };
      if (k === "generatedSentence" && !("verbForm" in so)) so.verbForm = null;
      o[k] = so;
    }
  }
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
