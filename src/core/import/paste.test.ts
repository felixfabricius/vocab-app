import { describe, expect, it } from "vitest";
import { extractJsonBlock, parsePasteImport, parseTsvLines } from "./paste";

const reply = `Here you go:

\`\`\`json
{
  "marker": "VOCABAPP-IMPORT v1",
  "notes": "Page 12 was mostly German.",
  "items": [
    {
      "lemma": "hacer planes", "pos": "phrase", "isPhrase": true,
      "senses": [{ "gloss": "to make plans" }],
      "priority": "core", "cefr": "A2", "usefulness": 4, "regional": "neutral",
      "generatedSentence": { "es": "Hicimos planes para el sábado.", "en": "We made plans for Saturday.", "target": "Hicimos planes", "verbForm": "hicimos" },
      "fromSentence": [{ "lemma": "sábado", "pos": "noun", "gloss": "Saturday", "target": "sábado" }],
      "pageRef": "12"
    },
    { "lemma": "casa", "pos": "noun", "gender": "f", "article": "la", "senses": ["house"], "priority": "essential" },
    { "lemma": "broken", "pos": "nope", "senses": [] }
  ]
}
\`\`\`
`;

describe("parsePasteImport", () => {
  it("reads the fenced block, tolerates omitted nullable fields, reports bad items", () => {
    const r = parsePasteImport(reply);
    expect(r.notes).toBe("Page 12 was mostly German.");
    expect(r.items.length).toBe(2);
    const p = r.items[0]!;
    expect(p.lemma).toBe("hacer planes");
    expect(p.generatedSentence?.span).toEqual([0, 14]);
    expect(p.fromSentence[0]?.span).toEqual([23, 29]);
    expect(p.verb).toBeUndefined();
    const c = r.items[1]!;
    expect(c.senses[0]?.gloss).toBe("house");
    expect(c.article).toBe("la");
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]?.index).toBe(2);
  });

  it("reads a v2 block with a batch tag and one sentence per item", () => {
    const v2 = `\`\`\`json
{ "marker": "VOCABAPP-IMPORT v2", "tag": "Casa de Papel S1E1", "notes": null, "items": [
  { "lemma": "atracar", "pos": "verb", "senses": ["to rob (a bank)"], "priority": "standard", "irregular": false,
    "sentence": { "es": "Vamos a atracar la Fábrica de Moneda.", "en": "We're going to rob the Mint.", "target": "atracar", "verbForm": "infinitive" },
    "sentenceSource": "source", "fromSentence": [{ "lemma": "fábrica", "pos": "noun", "gloss": "factory", "target": "Fábrica" }] },
  { "lemma": "al tiro", "pos": "phrase", "senses": ["right away"], "regional": "chile",
    "sentence": { "es": "Voy al tiro.", "en": "I'm going right away.", "target": "al tiro" } }
] }
\`\`\``;
    const r = parsePasteImport(v2);
    expect(r.errors).toEqual([]);
    expect(r.tag).toBe("Casa de Papel S1E1");
    const a = r.items[0]!;
    expect(a.sourceSentence?.es).toBe("Vamos a atracar la Fábrica de Moneda.");
    expect(a.sourceSentence?.span).toEqual([8, 15]);
    expect(a.generatedSentence).toBeUndefined();
    expect(a.fromSentence[0]?.span).toEqual([19, 26]);
    const b = r.items[1]!;
    expect(b.generatedSentence?.es).toBe("Voy al tiro."); // sentenceSource omitted → generated
    expect(b.isPhrase).toBe(true);
  });

  it("fails cleanly without JSON", () => {
    const r = parsePasteImport("nothing here");
    expect(r.items).toEqual([]);
    expect(r.errors[0]?.message).toMatch(/No JSON/);
  });

  it("extracts an unfenced object", () => {
    expect(extractJsonBlock('text {"items": []} more')).toBe('{"items": []}');
  });
});

describe("parseTsvLines", () => {
  it("parses tab and dash separated lines", () => {
    const r = parseTsvLines("casa\thouse\nhacer planes - to make plans\n\nbad line");
    expect(r.items.map((i) => i.lemma)).toEqual(["casa", "hacer planes"]);
    expect(r.items[1]?.isPhrase).toBe(true);
    expect(r.errors.length).toBe(1);
  });
});
