import { describe, expect, it } from "vitest";
import { buildDedupeIndex, didYouMean, findExact, stripAccents } from "./index";
import type { Entry } from "@/core/types";

const t = "2026-09-18T10:00:00.000Z";
function e(id: string, lemma: string, pos: Entry["pos"], status: Entry["status"] = "active"): Entry {
  return { id, lang: "es", lemma, pos, isPhrase: false, priority: "core", priorityAuto: true, regional: "neutral", tags: [], status, sourceIds: [], createdAt: t, updatedAt: t };
}

describe("dedupe", () => {
  const index = buildDedupeIndex([e("1", "está", "verb"), e("2", "esta", "pron"), e("3", "poder", "verb"), e("4", "poder", "noun"), e("5", "gone", "noun", "trashed")]);

  it("strips accents", () => {
    expect(stripAccents("está")).toBe("esta");
    expect(stripAccents("Año")).toBe("ano");
  });

  it("exact match is accent-sensitive and POS-sensitive", () => {
    expect(findExact(index, "está", "verb")?.id).toBe("1");
    expect(findExact(index, "esta", "verb")).toBeUndefined();
    expect(findExact(index, "poder", "noun")?.id).toBe("4");
    expect(findExact(index, "gone", "noun")).toBeUndefined();
  });

  it("did-you-mean surfaces accent variants without merging", () => {
    expect(didYouMean(index, "esta", "verb")?.lemma).toBe("está");
    expect(didYouMean(index, "está", "verb")).toBeUndefined();
    expect(didYouMean(index, "casa", "noun")).toBeUndefined();
  });
});
