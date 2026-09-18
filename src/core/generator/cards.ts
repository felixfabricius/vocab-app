/**
 * Card generation from entries. Idempotent: returns only the cards that do not
 * exist yet. Paradigm (verb × tense) generation lives in `paradigm.ts`.
 */
import type { Card, Entry, Sense } from "@/core/types";
import { newFsrsState } from "@/core/scheduler/fsrs";

export interface CardFactoryEnv {
  now: () => Date;
  newId: () => string;
}

/** One production card per sense; entries without senses get one card without a sense. */
export function missingProductionCards(
  entry: Entry,
  senses: Sense[],
  existing: Card[],
  env: CardFactoryEnv,
): Card[] {
  const have = new Set(
    existing.filter((c) => c.entryId === entry.id && c.type === "production").map((c) => c.senseId ?? ""),
  );
  const targets: (string | undefined)[] = senses.length > 0 ? senses.map((s) => s.id) : [undefined];
  const out: Card[] = [];
  for (const senseId of targets) {
    if (have.has(senseId ?? "")) continue;
    const now = env.now();
    out.push({
      id: env.newId(),
      entryId: entry.id,
      ...(senseId ? { senseId } : {}),
      type: "production",
      fsrs: newFsrsState(now),
      status: "active",
      flagged: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  return out;
}
