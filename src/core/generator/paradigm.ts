/**
 * Paradigm cards: one card per verb × active tense, following SPEC:
 *  - irregular verbs in Essential/Core get cards for every active tense
 *  - regular verbs get none, except the model verbs (hablar / comer / vivir)
 *  - `paradigmCards: "on" | "off"` on the entry overrides both rules
 * Idempotent: returns only cards that do not exist yet.
 */
import type { Card, Entry } from "@/core/types";
import { newFsrsState } from "@/core/scheduler/fsrs";
import type { CardFactoryEnv } from "./cards";

export const MODEL_VERBS = ["hablar", "comer", "vivir"]; // LANG

export function wantsParadigmCards(entry: Entry): boolean {
  if (entry.pos !== "verb" || entry.status !== "active") return false;
  const mode = entry.verb?.paradigmCards ?? "auto";
  if (mode === "on") return true;
  if (mode === "off") return false;
  if (MODEL_VERBS.includes(entry.lemma.toLowerCase())) return true;
  const irregular = entry.verb?.irregular ?? false;
  return irregular && (entry.priority === "essential" || entry.priority === "core");
}

export function missingParadigmCards(entry: Entry, activeTenses: string[], existing: Card[], env: CardFactoryEnv): Card[] {
  if (!wantsParadigmCards(entry)) return [];
  const have = new Set(existing.filter((c) => c.entryId === entry.id && c.type === "paradigm").map((c) => c.tense));
  const out: Card[] = [];
  for (const tense of activeTenses) {
    if (have.has(tense)) continue;
    const now = env.now();
    out.push({
      id: env.newId(),
      entryId: entry.id,
      type: "paradigm",
      tense,
      fsrs: newFsrsState(now),
      status: "active",
      flagged: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  return out;
}

/** Cards to (un)suspend when a tense is deactivated or reactivated. */
export function paradigmCardsForTense(cards: Card[], tense: string): Card[] {
  return cards.filter((c) => c.type === "paradigm" && c.tense === tense);
}
