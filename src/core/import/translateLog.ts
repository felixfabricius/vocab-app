/**
 * Parser for the translate log written by the iOS Shortcuts (see shortcuts/README.md).
 * One lookup per line, in either format:
 *   2026-09-18T19:05:12+02:00 ||| en-es ||| where is the bathroom ||| ¿Dónde está el baño?
 *   {"at": ISO, "dir": "en-es" | "es-en", "src": "...", "dst": "..."}
 * The first is what the Shortcuts write (easy to build with a Text action);
 * JSON lines are still accepted.
 */
import type { EntryDraft } from "@/core/types";

export const LOG_SEPARATOR = "|||";

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
    if (!raw.startsWith("{")) {
      const parts = raw.split(LOG_SEPARATOR).map((p) => p.trim());
      const dir = parts[1]?.toLowerCase().replace(/\s/g, "");
      if (parts.length < 4 || (dir !== "en-es" && dir !== "es-en") || !parts[2] || !parts[3]) {
        errors.push(`Line ${i + 1}: expected "date ||| en-es ||| input ||| translation"`);
        return;
      }
      // Extra separators inside the texts are unlikely; if present, keep them in the translation.
      const at = parts[0] ?? "";
      const src = parts[2];
      const dst = parts.slice(3).join(` ${LOG_SEPARATOR} `);
      const key = `${at}|${dir}|${src}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ at, dir, src, dst });
      return;
    }
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

/**
 * Rows newer than the last import. Rows whose date cannot be parsed are always kept
 * (duplicates are caught later by the entry dedupe).
 */
export function rowsAfter(rows: TranslateLogRow[], since: string | undefined): TranslateLogRow[] {
  const cutoff = since ? Date.parse(since) : NaN;
  if (Number.isNaN(cutoff)) return rows;
  return rows.filter((r) => {
    const t = Date.parse(r.at);
    return Number.isNaN(t) || t > cutoff;
  });
}

/** Latest parseable timestamp among the rows, as ISO. */
export function latestTimestamp(rows: TranslateLogRow[]): string | undefined {
  let max = NaN;
  for (const r of rows) {
    const t = Date.parse(r.at);
    if (!Number.isNaN(t) && (Number.isNaN(max) || t > max)) max = t;
  }
  return Number.isNaN(max) ? undefined : new Date(max).toISOString();
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
