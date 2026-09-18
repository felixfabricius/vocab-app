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
