import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { EntryDraftSchema, ExtractResultSchema, ScanResultSchema, TranslateResultSchema, normalizeDraft } from "./schema";

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
      regional: "neutral", note: null, irregular: null, sourceSentence: null, pageRef: null, fromSentence: [],
      generatedSentence: { es: "Hicimos planes para el sábado.", en: "We made plans.", target: "Hicimos planes", span: null, verbForm: null },
    } as const;
    const a = normalizeDraft(EntryDraftSchema.parse(base));
    expect(a.generatedSentence?.span).toEqual([0, 14]);
    const b = normalizeDraft(EntryDraftSchema.parse({ ...base, generatedSentence: { ...base.generatedSentence, target: null, span: [8, 14] } }));
    expect(b.generatedSentence?.span).toEqual([8, 14]);
    const c = normalizeDraft(EntryDraftSchema.parse({ ...base, generatedSentence: { ...base.generatedSentence, target: null, span: [20, 5] } }));
    expect(c.generatedSentence?.span).toBeUndefined();
  });
});
