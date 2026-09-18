import { describe, expect, it } from "vitest";
import { missingParadigmCards, wantsParadigmCards } from "./paradigm";
import type { Entry } from "@/core/types";

const t = "2026-09-18T10:00:00.000Z";
const env = { now: () => new Date(t), newId: (() => { let i = 0; return () => `c${++i}`; })() };

function verb(lemma: string, irregular: boolean, priority: Entry["priority"], mode: "auto" | "on" | "off" = "auto"): Entry {
  return { id: `e-${lemma}`, lang: "es", lemma, pos: "verb", isPhrase: false, priority, priorityAuto: true, regional: "neutral", tags: [], status: "active", sourceIds: [], verb: { irregular, paradigmCards: mode }, createdAt: t, updatedAt: t };
}

describe("paradigm cards", () => {
  it("applies the SPEC rules", () => {
    expect(wantsParadigmCards(verb("ser", true, "essential"))).toBe(true);
    expect(wantsParadigmCards(verb("ser", true, "niche"))).toBe(false);
    expect(wantsParadigmCards(verb("trabajar", false, "essential"))).toBe(false);
    expect(wantsParadigmCards(verb("hablar", false, "essential"))).toBe(true); // model verb
    expect(wantsParadigmCards(verb("trabajar", false, "essential", "on"))).toBe(true);
    expect(wantsParadigmCards(verb("ser", true, "essential", "off"))).toBe(false);
    expect(wantsParadigmCards({ ...verb("casa", false, "essential"), pos: "noun" })).toBe(false);
  });

  it("creates one card per active tense and is idempotent", () => {
    const e = verb("ser", true, "essential");
    const first = missingParadigmCards(e, ["pres", "pret"], [], env);
    expect(first.map((c) => c.tense)).toEqual(["pres", "pret"]);
    expect(first[0]!.type).toBe("paradigm");
    const more = missingParadigmCards(e, ["pres", "pret", "impf"], first, env);
    expect(more.map((c) => c.tense)).toEqual(["impf"]);
    expect(missingParadigmCards(e, ["pres"], [...first, ...more], env)).toEqual([]);
  });
});
