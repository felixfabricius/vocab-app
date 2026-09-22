import { describe, expect, it } from "vitest";
import { acceptBatch, createBatch, ignoreSuggestion } from "./importService";
import { DexieRepository } from "@/storage/DexieRepository";
import { VocabDB } from "@/storage/db";
import { applySeed } from "@/app/seed";
import type { EntryDraft } from "@/core/types";

let n = 0;
function fresh() {
  const db = new VocabDB(`import-${++n}`);
  return { db, repo: new DexieRepository(db) };
}

const drafts: EntryDraft[] = [
  {
    lemma: "hacer planes", pos: "phrase", isPhrase: true, senses: [{ gloss: "to make plans" }], priority: "core", regional: "neutral",
    generatedSentence: { es: "Hicimos planes para el sábado.", en: "We made plans for Saturday.", span: [0, 14], verbForm: "hicimos" },
    fromSentence: [{ lemma: "sábado", pos: "noun", gloss: "Saturday", span: [26, 32] }],
  },
  { lemma: "casa", pos: "noun", isPhrase: false, gender: "f", article: "la", senses: [{ gloss: "house" }], priority: "essential", regional: "neutral", fromSentence: [] },
  { lemma: "esta", pos: "verb", isPhrase: false, senses: [{ gloss: "is" }], priority: "niche", regional: "neutral", fromSentence: [] },
];

describe("import service", () => {
  it("creates suggestions with groups, known flags, and did-you-mean hints", async () => {
    const { repo } = fresh();
    await applySeed(repo, { version: 1, items: [
      { lemma: "casa", pos: "noun", senses: ["house"] },
      { lemma: "está", pos: "verb", senses: ["is"] },
    ] });
    const batch = await createBatch(repo, { sourceType: "paste", label: "test", drafts });
    const sugg = await repo.suggestionsForBatch(batch.id);
    expect(batch.counts).toEqual({ found: 3, known: 1, new: 3 });
    const byLemma = new Map(sugg.map((s) => [s.draft.lemma, s]));
    expect(byLemma.get("hacer planes")?.group).toBe("phrases");
    expect(byLemma.get("sábado")?.group).toBe("fromSentences");
    expect(byLemma.get("sábado")?.checked).toBe(true);
    expect(byLemma.get("sábado")?.draft.sourceSentence?.es).toBe("Hicimos planes para el sábado.");
    expect(byLemma.get("casa")?.existingEntryId).toBeDefined();
    // every row starts checked (drafts table: swipe away, then accept all)
    expect(byLemma.get("casa")?.checked).toBe(true);
    expect(byLemma.get("esta")?.didYouMean).toBe("está");
    expect(byLemma.get("esta")?.checked).toBe(true);
  });

  it("accepting creates entries, shares one sentence between parent and child, and attaches to known entries", async () => {
    const { repo, db } = fresh();
    await applySeed(repo, { version: 1, items: [{ lemma: "casa", pos: "noun", senses: ["house"] }] });
    const batch = await createBatch(repo, { sourceType: "paste", label: "test", tag: "aula p. 3", drafts });
    const sugg = await repo.suggestionsForBatch(batch.id);
    // swipe "esta" away
    await repo.putSuggestions(sugg.map((s) => (s.draft.lemma === "esta" ? { ...s, checked: false } : s)));

    const res = await acceptBatch(repo, batch.id);
    expect(res.created).toBe(2); // hacer planes + sábado
    expect(res.attached).toBe(1); // casa
    expect(res.bareIds).toEqual([]); // both have the shared sentence; a phrase would not count anyway
    expect(await db.sentences.count()).toBe(1);
    const planes = await repo.findEntry("hacer planes", "phrase");
    const sabado = await repo.findEntry("sábado", "noun");
    const casa = await repo.findEntry("casa", "noun");
    expect(planes?.isPhrase).toBe(true);
    expect(planes?.tags).toEqual(["aula p. 3"]);
    expect(casa?.tags).toEqual(["seed", "aula p. 3"]); // tag added to the attached existing entry
    // the seed noun (no sentence) and sábado (noun without article); the phrase never appears
    expect((await repo.entryIdsWithoutSentences()).sort()).toEqual([casa!.id, sabado!.id].sort());
    expect(sabado?.priority).toBe("standard");
    expect((await repo.allTags()).map((t) => t.tag)).toContain("aula p. 3");
    const encs = await db.encounters.toArray();
    expect(encs.filter((e) => e.entryId === planes!.id).length).toBe(1);
    expect(encs.find((e) => e.entryId === sabado!.id)?.span).toEqual([26, 32]);
    expect(await db.cards.count()).toBe(3); // casa (seed) + 2 new
    const done = await repo.suggestionsForBatch(batch.id);
    expect(done.find((s) => s.draft.lemma === "esta")?.decision).toBe("excluded");
    expect((await repo.getBatch(batch.id))?.stage).toBe("done");
  });

  it("ignored lemmas never come back", async () => {
    const { repo } = fresh();
    const batch = await createBatch(repo, { sourceType: "paste", label: "test", drafts });
    const sugg = await repo.suggestionsForBatch(batch.id);
    await ignoreSuggestion(repo, sugg.find((s) => s.draft.lemma === "esta")!);
    const batch2 = await createBatch(repo, { sourceType: "paste", label: "again", drafts });
    const sugg2 = await repo.suggestionsForBatch(batch2.id);
    expect(sugg2.some((s) => s.draft.lemma === "esta")).toBe(false);
  });
});
