import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "./DexieRepository";
import { VocabDB } from "./db";
import { newFsrsState } from "@/core/scheduler/fsrs";
import type { Card, Entry, Sense } from "@/core/types";

const t = "2026-09-18T10:00:00.000Z";
let db: VocabDB;
let repo: DexieRepository;
let n = 0;

beforeEach(async () => {
  db = new VocabDB(`test-${++n}`);
  repo = new DexieRepository(db);
});

function entry(id: string, lemma: string): Entry {
  return {
    id, lang: "es", lemma, pos: "noun", isPhrase: false, priority: "core", priorityAuto: true,
    regional: "neutral", tags: [], status: "active", sourceIds: [], createdAt: t, updatedAt: t,
  };
}

describe("DexieRepository", () => {
  it("returns defaults merged with saved settings", async () => {
    const s0 = await repo.getSettings();
    expect(s0.dailyNewLimit).toBe(20);
    await repo.saveSettings({ dailyNewLimit: 35 });
    const s1 = await repo.getSettings();
    expect(s1.dailyNewLimit).toBe(35);
    expect(s1.playback).toBe("audioOn");
  });

  it("finds entries by lemma and pos, and assembles bundles", async () => {
    await repo.putEntries([entry("e1", "banco")]);
    const senses: Sense[] = [{ id: "s1", entryId: "e1", gloss: "bank", order: 0, createdAt: t, updatedAt: t }];
    await repo.putSenses(senses);
    await repo.putSentences([{ id: "x1", es: "Voy al banco.", en: "I go to the bank.", origin: "generated", createdAt: t, updatedAt: t }]);
    await repo.putEncounters([{ id: "n1", entryId: "e1", sentenceId: "x1", span: [7, 12], createdAt: t }]);
    const card: Card = {
      id: "c1", entryId: "e1", senseId: "s1", type: "production", fsrs: newFsrsState(new Date(t)),
      status: "active", flagged: false, createdAt: t, updatedAt: t,
    };
    await repo.putCards([card]);

    expect((await repo.findEntry("banco", "noun"))?.id).toBe("e1");
    expect(await repo.findEntry("banco", "verb")).toBeUndefined();
    const b = await repo.getBundle("e1");
    expect(b?.senses.map((s) => s.gloss)).toEqual(["bank"]);
    expect(b?.cards.map((c) => c.id)).toEqual(["c1"]);
    expect(b?.sentences.map((s) => s.es)).toEqual(["Voy al banco."]);
  });

  it("records mutations in the outbox", async () => {
    await repo.putEntries([entry("e1", "casa"), entry("e2", "perro")]);
    await repo.trashEntry("e1", t);
    const rows = await db.outbox.toArray();
    const upserts = rows.filter((r) => r.table === "entries" && r.op === "upsert");
    expect(upserts.length).toBeGreaterThanOrEqual(3); // 2 puts + 1 update
    expect(rows.some((r) => r.table === "outbox")).toBe(false);
  });

  it("exports and re-imports with replace and merge semantics", async () => {
    await repo.putEntries([entry("e1", "casa")]);
    const dump = await repo.exportAll();
    expect((dump.entries as Entry[]).length).toBe(1);

    const other = new DexieRepository(new VocabDB(`test-other-${n}`));
    await other.putEntries([{ ...entry("e1", "stale"), updatedAt: "2020-01-01T00:00:00.000Z" }, entry("e9", "gato")]);
    await other.importAll(dump, "merge");
    expect((await other.getEntry("e1"))?.lemma).toBe("casa");
    expect(await other.getEntry("e9")).toBeDefined();

    await other.importAll(dump, "replace");
    expect(await other.getEntry("e9")).toBeUndefined();
  });

  it("purges trashed entries older than the cutoff with their children", async () => {
    await repo.putEntries([entry("e1", "casa")]);
    await repo.putSenses([{ id: "s1", entryId: "e1", gloss: "house", order: 0, createdAt: t, updatedAt: t }]);
    await repo.trashEntry("e1", "2026-08-01T00:00:00.000Z");
    const purged = await repo.purgeTrashedBefore("2026-09-01T00:00:00.000Z");
    expect(purged).toBe(1);
    expect(await repo.getEntry("e1")).toBeUndefined();
    expect(await db.senses.count()).toBe(0);
  });
});
