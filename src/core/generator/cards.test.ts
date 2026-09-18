import { describe, expect, it } from "vitest";
import { missingProductionCards } from "./cards";
import type { Entry, Sense } from "@/core/types";

const t = "2026-09-18T10:00:00.000Z";
const env = { now: () => new Date(t), newId: (() => { let i = 0; return () => `c${++i}`; })() };

const entry: Entry = {
  id: "e1", lang: "es", lemma: "banco", pos: "noun", isPhrase: false, priority: "core", priorityAuto: true,
  regional: "neutral", tags: [], status: "active", sourceIds: [], createdAt: t, updatedAt: t,
};
const senses: Sense[] = [
  { id: "s1", entryId: "e1", gloss: "bank", order: 0, createdAt: t, updatedAt: t },
  { id: "s2", entryId: "e1", gloss: "bench", order: 1, createdAt: t, updatedAt: t },
];

describe("missingProductionCards", () => {
  it("creates one card per sense and is idempotent", () => {
    const first = missingProductionCards(entry, senses, [], env);
    expect(first.map((c) => c.senseId)).toEqual(["s1", "s2"]);
    expect(first[0]!.fsrs.state).toBe(0);
    const second = missingProductionCards(entry, senses, first, env);
    expect(second).toEqual([]);
  });

  it("adds only the card for a newly added sense", () => {
    const existing = missingProductionCards(entry, [senses[0]!], [], env);
    const added = missingProductionCards(entry, senses, existing, env);
    expect(added.map((c) => c.senseId)).toEqual(["s2"]);
  });

  it("creates a sense-less card when the entry has no senses", () => {
    const cards = missingProductionCards(entry, [], [], env);
    expect(cards.length).toBe(1);
    expect(cards[0]!.senseId).toBeUndefined();
  });
});
