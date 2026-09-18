/**
 * Tense plan: which tenses are active, and paradigm card generation when a
 * tense is activated or a verb entry is created.
 */
import { LANGUAGE } from "@/config/language";
import { newId, nowIso } from "@/core/ids";
import { missingParadigmCards, paradigmCardsForTense } from "@/core/generator/paradigm";
import type { Entry, TensePlanRow } from "@/core/types";
import type { Repository } from "@/storage/Repository";

export async function getTensePlan(repo: Repository): Promise<TensePlanRow[]> {
  let rows = await repo.getTensePlan();
  if (rows.length === 0) {
    rows = LANGUAGE.tensePlan.map((t, order) => ({ tense: t.id, order, status: order === 0 ? "active" : "locked" }));
    await repo.putTensePlan(rows);
  }
  return rows;
}

export async function activeTenses(repo: Repository): Promise<string[]> {
  return (await getTensePlan(repo)).filter((r) => r.status === "active").map((r) => r.tense);
}

export function tenseLabel(id: string): string {
  return LANGUAGE.tensePlan.find((t) => t.id === id)?.label ?? id;
}

/** Create any missing paradigm cards for these entries against the active tenses. Returns the number created. */
export async function ensureParadigmCards(repo: Repository, entries: Entry[], tenses?: string[]): Promise<number> {
  const active = tenses ?? (await activeTenses(repo));
  if (active.length === 0) return 0;
  const env = { now: () => new Date(), newId };
  let created = 0;
  for (const entry of entries) {
    if (entry.pos !== "verb") continue;
    const existing = await repo.cardsForEntry(entry.id);
    const missing = missingParadigmCards(entry, active, existing, env);
    if (missing.length) {
      await repo.putCards(missing);
      created += missing.length;
    }
  }
  return created;
}

/** Remove paradigm cards an entry no longer wants (after switching to "off"); keeps review logs. */
export async function dropParadigmCards(repo: Repository, entry: Entry): Promise<number> {
  const cards = (await repo.cardsForEntry(entry.id)).filter((c) => c.type === "paradigm");
  if (cards.length) await repo.deleteCards(cards.map((c) => c.id));
  return cards.length;
}

export async function setTenseActive(repo: Repository, tense: string, active: boolean): Promise<{ created: number; toggled: number }> {
  const rows = await getTensePlan(repo);
  await repo.putTensePlan(rows.map((r) => (r.tense === tense ? { ...r, status: active ? "active" : "locked" } : r)));
  const at = nowIso();
  const all = await repo.allCards();
  const affected = paradigmCardsForTense(all, tense);
  await repo.putCards(affected.map((c) => ({ ...c, status: active ? "active" : "suspended", updatedAt: at })));
  let created = 0;
  if (active) {
    const entries = [...(await repo.allActiveEntriesById()).values()];
    created = await ensureParadigmCards(repo, entries, [tense]);
  }
  return { created, toggled: affected.length };
}
