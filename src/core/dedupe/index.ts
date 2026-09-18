/**
 * Identity of an entry is exact and accent-sensitive: lemma + part of speech.
 * Accent-insensitive lookup exists only to surface a "did you mean" hint.
 */
import type { Entry, Pos } from "@/core/types";

export function entryKey(lemma: string, pos: Pos | string): string {
  return `${lemma.trim().toLowerCase()}|${pos}`;
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface DedupeIndex {
  byKey: Map<string, Entry>;
  byStripped: Map<string, Entry[]>;
}

export function buildDedupeIndex(entries: Iterable<Entry>): DedupeIndex {
  const byKey = new Map<string, Entry>();
  const byStripped = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.status === "trashed") continue;
    byKey.set(entryKey(e.lemma, e.pos), e);
    const k = stripAccents(e.lemma);
    const list = byStripped.get(k) ?? [];
    list.push(e);
    byStripped.set(k, list);
  }
  return { byKey, byStripped };
}

export function findExact(index: DedupeIndex, lemma: string, pos: Pos): Entry | undefined {
  return index.byKey.get(entryKey(lemma, pos));
}

/** An existing entry that differs only by accents (or a different POS with the same spelling). */
export function didYouMean(index: DedupeIndex, lemma: string, pos: Pos): Entry | undefined {
  const exact = findExact(index, lemma, pos);
  if (exact) return undefined;
  const candidates = index.byStripped.get(stripAccents(lemma)) ?? [];
  return candidates.find((c) => c.lemma.toLowerCase() !== lemma.trim().toLowerCase()) ?? candidates[0];
}
