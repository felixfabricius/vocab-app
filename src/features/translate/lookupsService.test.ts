import { describe, expect, it } from "vitest";
import { createCardsFromLookups, draftFromLookup, draftFromLookupRow, newLookup } from "./lookupsService";
import { mergeDraft } from "@/features/entries/enrichService";
import { DexieRepository } from "@/storage/DexieRepository";
import { VocabDB } from "@/storage/db";
import type { EntryDraft } from "@/core/types";

let n = 0;
function fresh() {
  const db = new VocabDB(`lookups-${++n}`);
  return { db, repo: new DexieRepository(db) };
}

describe("lookups → drafts", () => {
  it("strips trailing punctuation and makes sentences phrase drafts", () => {
    const d = draftFromLookupRow({ dir: "en-es", src: "where is the bathroom?", dst: "¿Dónde está el baño?" });
    expect(d?.lemma).toBe("¿Dónde está el baño");
    expect(d?.pos).toBe("phrase");
    expect(draftFromLookupRow({ dir: "es-en", src: "", dst: "x" })).toBeUndefined();
  });

  it("builds minimal drafts from either direction and prefers a stored Claude draft", () => {
    const a = draftFromLookup(newLookup({ dir: "en-es", src: "right away", dst: "al tiro", provider: "apple" }));
    expect(a?.lemma).toBe("al tiro");
    expect(a?.senses[0]?.gloss).toBe("right away");
    expect(a?.isPhrase).toBe(true);
    const claude: EntryDraft = { lemma: "cachar", pos: "verb", isPhrase: false, senses: [{ gloss: "to get it" }], priority: "core", regional: "chile", fromSentence: [] };
    const b = draftFromLookup(newLookup({ dir: "es-en", src: "cachái?", dst: "you get it?", provider: "claude", draft: claude }));
    expect(b).toBe(claude);
  });

  it("consumes every unconsumed lookup into one batch, deduped by Spanish text", async () => {
    const { repo } = fresh();
    await repo.putLookups([
      newLookup({ dir: "en-es", src: "right away", dst: "al tiro", provider: "apple", at: "2026-09-22T10:00:00Z" }),
      newLookup({ dir: "es-en", src: "al tiro", dst: "right away", provider: "shortcuts", at: "2026-09-22T10:01:00Z" }),
      newLookup({ dir: "en-es", src: "I would like to book a table", dst: "Quisiera reservar una mesa", provider: "apple", at: "2026-09-22T10:02:00Z" }),
    ]);
    expect(await repo.countUnconsumedLookups()).toBe(3);
    const r = await createCardsFromLookups(repo, undefined, undefined);
    expect(r.lookups).toBe(3);
    expect(r.drafts).toBe(2);
    expect(await repo.countUnconsumedLookups()).toBe(0);
    const rows = await repo.suggestionsForBatch(r.batchId!);
    expect(rows.map((s) => s.draft.lemma).sort()).toEqual(["Quisiera reservar una mesa", "al tiro"]);
    expect(rows.every((s) => s.checked)).toBe(true);
    const again = await createCardsFromLookups(repo, undefined, undefined);
    expect(again.batchId).toBeUndefined();
  });
});

describe("mergeDraft", () => {
  it("keeps the base lemma and first gloss and fills the rest", () => {
    const base: EntryDraft = { lemma: "al tiro", pos: "phrase", isPhrase: true, senses: [{ gloss: "right away" }], priority: "standard", regional: "neutral", fromSentence: [] };
    const enriched: EntryDraft = {
      lemma: "al tiro", pos: "phrase", isPhrase: true, senses: [{ gloss: "right away" }, { gloss: "immediately" }], priority: "core", regional: "chile", note: "Chilean",
      generatedSentence: { es: "Voy al tiro.", en: "I'm going right away.", span: [4, 11] }, fromSentence: [{ lemma: "ir", pos: "verb", gloss: "to go", span: [0, 3] }],
    };
    const m = mergeDraft(base, enriched);
    expect(m.lemma).toBe("al tiro");
    expect(m.senses.map((s) => s.gloss)).toEqual(["right away", "immediately"]);
    expect(m.priority).toBe("core");
    expect(m.regional).toBe("chile");
    expect(m.note).toBe("Chilean");
    expect(m.generatedSentence?.es).toBe("Voy al tiro.");
    expect(m.fromSentence.length).toBe(1);
  });
  it("does not override a rank-derived priority", () => {
    const base: EntryDraft = { lemma: "casa", pos: "noun", isPhrase: false, senses: [{ gloss: "house" }], priority: "essential", frequencyRank: 120, regional: "neutral", fromSentence: [] };
    const m = mergeDraft(base, { ...base, priority: "niche", gender: "f", article: "la" });
    expect(m.priority).toBe("essential");
    expect(m.article).toBe("la");
  });
});
