import { describe, expect, it } from "vitest";
import { applySeed, seedIfNeeded, spanFor, type SeedFile } from "./seed";
import { DexieRepository } from "@/storage/DexieRepository";
import { VocabDB } from "@/storage/db";

let n = 0;
const seed: SeedFile = {
  version: 1,
  items: [
    { lemma: "casa", pos: "noun", gender: "f", article: "la", frequencyRank: 90, senses: ["house"], sentence: { es: "Mi casa es grande.", en: "My house is big.", target: "casa" } },
    { lemma: "ser", pos: "verb", irregular: true, frequencyRank: 4, senses: ["to be"], sentence: { es: "Ella es doctora.", en: "She is a doctor.", target: "es" } },
    { lemma: "por favor", pos: "phrase", senses: ["please"] },
  ],
};

describe("seed", () => {
  it("computes spans case-insensitively", () => {
    expect(spanFor("Mi casa es grande.", "casa")).toEqual([3, 7]);
    expect(spanFor("Ella es doctora.", "Es")).toEqual([5, 7]);
    expect(spanFor("Hola", "adiós")).toBeUndefined();
  });

  it("creates entries, senses, sentences, encounters and cards, and is idempotent", async () => {
    const db = new VocabDB(`seed-${++n}`);
    const repo = new DexieRepository(db);
    const added = await applySeed(repo, seed);
    expect(added).toBe(3);
    expect(await db.entries.count()).toBe(3);
    expect(await db.cards.count()).toBe(3);
    expect(await db.sentences.count()).toBe(2);
    const ser = await repo.findEntry("ser", "verb");
    expect(ser?.verb?.irregular).toBe(true);
    expect(ser?.priority).toBe("essential");
    const phrase = await repo.findEntry("por favor", "phrase");
    expect(phrase?.isPhrase).toBe(true);
    const again = await applySeed(repo, seed);
    expect(again).toBe(0);
  });

  it("seedIfNeeded runs once per version", async () => {
    const db = new VocabDB(`seed-${++n}`);
    const repo = new DexieRepository(db);
    const first = await seedIfNeeded(repo, async () => seed);
    const second = await seedIfNeeded(repo, async () => seed);
    expect(first).toBe(3);
    expect(second).toBe(0);
    const third = await seedIfNeeded(repo, async () => ({ ...seed, version: 2, items: [...seed.items, { lemma: "agua", pos: "noun", senses: ["water"] }] }));
    expect(third).toBe(1);
  });
});
