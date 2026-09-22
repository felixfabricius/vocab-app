import { describe, expect, it } from "vitest";
import { looksSpanish } from "./language";

describe("looksSpanish", () => {
  it("recognises accents, ñ and inverted punctuation", () => {
    expect(looksSpanish("¿Dónde está el baño?")).toBe(true);
    expect(looksSpanish("mañana")).toBe(true);
  });
  it("uses function words when there are no markers", () => {
    expect(looksSpanish("la casa de mi amigo")).toBe(true);
    expect(looksSpanish("the house of my friend")).toBe(false);
  });
  it("falls back to word endings for single words", () => {
    expect(looksSpanish("caminar")).toBe(true);
    expect(looksSpanish("walk")).toBe(false);
  });
  it("is false for empty input", () => {
    expect(looksSpanish("  ")).toBe(false);
  });
});
