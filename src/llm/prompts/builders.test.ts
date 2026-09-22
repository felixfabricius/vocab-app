import { describe, expect, it } from "vitest";
import { bookPrompt, contextPrompt, seriesPrompt, seriesTag, textbookPrompt, textbookTag } from "./builders";
import { PASTE_HEADER } from "./extract";

const ctx = { chunking: "balanced" as const, knownLemmas: ["casa", "perro"], ignoreLemmas: ["ok"] };

describe("prompt builders", () => {
  it("series: subtitles as sentences, basic words skipped, tag from series and episode", () => {
    const r = seriesPrompt(ctx, { series: "La casa de papel", season: "1", episode: "3", targetCount: 30, phrasePreference: "many" });
    expect(r.tag).toBe("La casa de papel S1E3");
    expect(r.prompt).toContain(PASTE_HEADER);
    expect(r.prompt).toContain("subtitles");
    expect(r.prompt).toContain("Also skip the roughly 200 most common");
    expect(r.prompt).toContain("Aim for about 30 items");
    expect(r.prompt).toContain("Favour phrases");
    expect(r.prompt).toContain('"tag": "La casa de papel S1E3"');
    expect(r.prompt).toContain("Known lemmas");
    expect(seriesTag({ series: "Élite", tag: " mine " })).toBe("mine");
  });

  it("textbook: German glosses translated and dropped, tag = book + page", () => {
    const r = textbookPrompt(ctx, { book: "Aula 1", page: "23" });
    expect(r.tag).toBe("Aula 1 p. 23");
    expect(r.prompt).toContain("never output German");
    expect(r.prompt).toContain("Return every vocabulary item");
    expect(textbookTag({ book: "Aula 1" })).toBe("Aula 1");
    expect(textbookTag({}, new Date("2026-09-22T12:00:00Z"))).toBe("textbook 2026-09-22");
    expect(textbookPrompt(ctx, {}).prompt).toContain("one or more photos");
  });

  it("book: density guidance", () => {
    expect(bookPrompt(ctx, { book: "Cien años", density: "all" }).prompt).toContain("Take everything");
    expect(bookPrompt(ctx, { book: "Cien años" }).prompt).toContain("unlikely to know");
  });

  it("context: no source text, invented vocabulary", () => {
    const r = contextPrompt(ctx, { situation: "renting a flat in Santiago" });
    expect(r.prompt).toContain("There is no source text");
    expect(r.prompt).toContain("renting a flat in Santiago");
    expect(r.tag).toBe("renting a flat in Santiago");
  });

  it("the shared prompt asks for one sentence with its source", () => {
    const r = textbookPrompt(ctx, { book: "Aula 1" });
    expect(r.prompt).toContain('sentenceSource: "source"');
    expect(r.prompt).not.toContain("generatedSentence");
  });
});
