import { describe, expect, it } from "vitest";
import { buildSession } from "./session";
import { newFsrsState } from "./fsrs";
import { DEFAULT_SETTINGS, type Card, type Entry, type Priority } from "@/core/types";

const now = new Date(2026, 8, 18, 12, 0); // local noon

function entry(id: string, priority: Priority, rank?: number): Entry {
  return {
    id,
    lang: "es",
    lemma: id,
    pos: "noun",
    isPhrase: false,
    priority,
    priorityAuto: true,
    ...(rank !== undefined ? { frequencyRank: rank } : {}),
    regional: "neutral",
    tags: [],
    status: "active",
    sourceIds: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function card(id: string, entryId: string, patch: Partial<Card["fsrs"]> = {}, extra: Partial<Card> = {}): Card {
  return {
    id,
    entryId,
    type: "production",
    fsrs: { ...newFsrsState(now), ...patch },
    status: "active",
    flagged: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  };
}

describe("buildSession", () => {
  it("splits new, learning and due cards", () => {
    const entries = new Map([
      ["a", entry("a", "essential", 1)],
      ["b", entry("b", "core", 700)],
      ["c", entry("c", "niche")],
    ]);
    const cards = [
      card("n1", "a"),
      card("l1", "b", { state: 1, due: new Date(now.getTime() + 5 * 60_000).toISOString() }),
      card("d1", "c", { state: 2, due: new Date(now.getTime() - 86_400_000).toISOString(), scheduledDays: 3 }),
      card("later", "c", { state: 2, due: new Date(now.getTime() + 3 * 86_400_000).toISOString() }),
    ];
    const s = buildSession({ cards, entriesById: entries, settings: DEFAULT_SETTINGS, now });
    expect(s.fresh.map((c) => c.id)).toEqual(["n1"]);
    expect(s.learning.map((c) => c.id)).toEqual(["l1"]);
    expect(s.due.map((c) => c.id)).toEqual(["d1"]);
  });

  it("respects the daily new limit and class quotas, flowing unused quota down", () => {
    const entries = new Map<string, Entry>();
    const cards: Card[] = [];
    // 3 essential, 30 core, 30 niche new cards
    for (let i = 0; i < 3; i++) {
      entries.set(`e${i}`, entry(`e${i}`, "essential", i + 1));
      cards.push(card(`ce${i}`, `e${i}`));
    }
    for (let i = 0; i < 30; i++) {
      entries.set(`c${i}`, entry(`c${i}`, "core", 600 + i));
      cards.push(card(`cc${i}`, `c${i}`));
    }
    for (let i = 0; i < 30; i++) {
      entries.set(`n${i}`, entry(`n${i}`, "niche"));
      cards.push(card(`cn${i}`, `n${i}`));
    }
    const s = buildSession({
      cards,
      entriesById: entries,
      settings: { ...DEFAULT_SETTINGS, dailyNewLimit: 20 },
      now,
    });
    expect(s.fresh.length).toBe(20);
    const byClass = { essential: 0, core: 0, standard: 0, niche: 0 };
    for (const c of s.fresh) byClass[entries.get(c.entryId)!.priority]++;
    expect(byClass.essential).toBe(3); // all that exist
    expect(byClass.core).toBeGreaterThanOrEqual(14); // 25% quota + carried essential quota
    expect(byClass.niche).toBeLessThanOrEqual(3);
  });

  it("counts cards introduced today against the limit", () => {
    const entries = new Map([["a", entry("a", "core", 1)]]);
    const cards: Card[] = [];
    for (let i = 0; i < 5; i++) {
      cards.push(
        card(`done${i}`, "a", { state: 2, due: new Date(now.getTime() + 86_400_000 * 3).toISOString() }, {
          introducedOn: "2026-09-18",
        }),
      );
    }
    for (let i = 0; i < 5; i++) cards.push(card(`new${i}`, "a"));
    const s = buildSession({
      cards,
      entriesById: entries,
      settings: { ...DEFAULT_SETTINGS, dailyNewLimit: 7 },
      now,
    });
    expect(s.introducedToday).toBe(5);
    expect(s.fresh.length).toBe(2);
  });

  it("orders due cards by class then overdue ratio and caps the session", () => {
    const entries = new Map([
      ["e", entry("e", "essential", 1)],
      ["n", entry("n", "niche")],
    ]);
    const old = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const cards = [
      card("n-very-late", "n", { state: 2, due: old(10), scheduledDays: 1 }),
      card("e-late", "e", { state: 2, due: old(1), scheduledDays: 5 }),
      card("e-later", "e", { state: 2, due: old(4), scheduledDays: 5 }),
    ];
    const s = buildSession({ cards, entriesById: entries, settings: DEFAULT_SETTINGS, now });
    expect(s.due.map((c) => c.id)).toEqual(["e-later", "e-late", "n-very-late"]);
    const capped = buildSession({
      cards,
      entriesById: entries,
      settings: { ...DEFAULT_SETTINGS, sessionCap: 2 },
      now,
    });
    expect(capped.due.map((c) => c.id)).toEqual(["e-later", "e-late"]);
  });

  it("excludes suspended cards, suspended entries, and buried cards until their time", () => {
    const entries = new Map([
      ["a", entry("a", "core", 1)],
      ["s", { ...entry("s", "core", 2), status: "suspended" as const }],
    ]);
    const cards = [
      card("ok", "a"),
      card("susp", "a", {}, { status: "suspended" }),
      card("buried", "a", {}, { status: "buried", buriedUntil: new Date(now.getTime() + 3600_000).toISOString() }),
      card("unburied", "a", {}, { status: "buried", buriedUntil: new Date(now.getTime() - 3600_000).toISOString() }),
      card("entry-susp", "s"),
    ];
    const s = buildSession({ cards, entriesById: entries, settings: DEFAULT_SETTINGS, now });
    expect(s.fresh.map((c) => c.id).sort()).toEqual(["ok", "unburied"]);
  });
});
