/**
 * Parser for the translate log written by the iOS Shortcuts (see shortcuts/README.md):
 * one JSON object per line: {"at": ISO, "dir": "en-es" | "es-en", "src": "...", "dst": "..."}
 */
import type { EntryDraft } from "@/core/types";

export interface TranslateLogRow {
  at: string;
  dir: "en-es" | "es-en";
  src: string;
  dst: string;
}

export function parseTranslateLog(text: string): { rows: TranslateLogRow[]; errors: string[] } {
  const rows: TranslateLogRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    try {
      const o = JSON.parse(raw) as Partial<TranslateLogRow>;
      if (typeof o.src !== "string" || typeof o.dst !== "string" || (o.dir !== "en-es" && o.dir !== "es-en")) {
        errors.push(`Line ${i + 1}: missing src/dst/dir`);
        return;
      }
      const at = typeof o.at === "string" ? o.at : new Date(0).toISOString();
      const key = `${at}|${o.dir}|${o.src}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ at, dir: o.dir, src: o.src.trim(), dst: o.dst.trim() });
    } catch {
      errors.push(`Line ${i + 1}: not JSON`);
    }
  });
  return { rows, errors };
}

/** Minimal drafts: the Spanish side becomes the lemma, the English side the gloss. Claude can enrich later. */
export function draftsFromTranslateLog(rows: TranslateLogRow[]): EntryDraft[] {
  const out: EntryDraft[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const es = (r.dir === "en-es" ? r.dst : r.src).replace(/[.!?¡¿]+$/g, "").trim();
    const en = (r.dir === "en-es" ? r.src : r.dst).replace(/[.!?]+$/g, "").trim();
    if (!es || !en) continue;
    const words = es.split(/\s+/).length;
    if (words > 8) continue; // full sentences are not flashcards; keep them for the sentence bank later
    const key = es.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      lemma: es,
      pos: words > 1 ? "phrase" : "other",
      isPhrase: words > 1,
      senses: [{ gloss: en }],
      priority: "standard",
      regional: "neutral",
      fromSentence: [],
    });
  }
  return out;
}
