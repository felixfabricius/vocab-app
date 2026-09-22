import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EntryDraftSchema, ExtractResultSchema, LegacyEntryDraftSchema, ScanResultSchema, TranslateResultSchema, normalizeDraft, normalizeLegacyDraft } from "./schema";

describe("structured-output schemas", () => {
  it("are accepted by the SDK's JSON-schema transformer", () => {
    // Regression: z.tuple emitted `"items": false`, which the transformer rejects with
    // "JSON schema must have a type defined if anyOf/oneOf/allOf are not used".
    for (const s of [ExtractResultSchema, ScanResultSchema, TranslateResultSchema]) {
      expect(() => betaZodOutputFormat(s)).not.toThrow();
    }
  });

  it("normalizes spans from arrays and falls back to the target text", () => {
    const base = {
      lemma: "hacer planes", pos: "phrase", isPhrase: true, gender: null, article: null, plural: null,
      senses: [{ gloss: "to make plans", reflexive: null }], priority: "core", cefr: "A2", usefulness: 4,
      regional: "neutral", note: null, irregular: null, pageRef: null, fromSentence: [{ lemma: "sábado", pos: "noun", gloss: "Saturday", target: "sábado" }],
      sentence: { es: "Hicimos planes para el sábado.", en: "We made plans.", target: "Hicimos planes", span: null, verbForm: null },
      sentenceSource: "generated",
    } as const;
    const a = normalizeDraft(EntryDraftSchema.parse(base));
    expect(a.generatedSentence?.span).toEqual([0, 14]);
    expect(a.sourceSentence).toBeUndefined();
    expect(a.fromSentence[0]?.span).toEqual([23, 29]);
    const b = normalizeDraft(EntryDraftSchema.parse({ ...base, sentence: { ...base.sentence, target: null, span: [8, 14] } }));
    expect(b.generatedSentence?.span).toEqual([8, 14]);
    const c = normalizeDraft(EntryDraftSchema.parse({ ...base, sentence: { ...base.sentence, target: null, span: [20, 5] } }));
    expect(c.generatedSentence?.span).toBeUndefined();
    const d = normalizeDraft(EntryDraftSchema.parse({ ...base, sentenceSource: "source" }));
    expect(d.sourceSentence?.span).toEqual([0, 14]);
    expect(d.generatedSentence).toBeUndefined();
  });

  it("still reads v1 items with two sentence fields", () => {
    const v1 = {
      lemma: "casa", pos: "noun", isPhrase: false, gender: "f", article: "la", plural: null, senses: [{ gloss: "house", reflexive: null }],
      priority: "essential", cefr: null, usefulness: null, regional: "neutral", note: null, irregular: null, pageRef: null, fromSentence: [],
      sourceSentence: { es: "Mi casa es grande.", en: "My house is big.", target: "casa", span: null },
      generatedSentence: { es: "Vivo en una casa azul.", en: "I live in a blue house.", target: "casa", span: null, verbForm: null },
    } as const;
    const d = normalizeLegacyDraft(LegacyEntryDraftSchema.parse(v1));
    expect(d.sourceSentence?.span).toEqual([3, 7]);
    expect(d.generatedSentence?.span).toEqual([12, 16]);
  });
});
