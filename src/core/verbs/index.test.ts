import { describe, expect, it } from "vitest";
import { conjugate, isIrregular, type VerbTable } from "./index";

const table: VerbTable = {
  verbs: {
    ser: { en: "to be", irregular: true, gerund: "siendo", participle: "sido", forms: { pres: ["soy", "eres", "es", "somos", "sois", "son"] } },
    levantar: { en: "to lift", irregular: false, gerund: "levantando", participle: "levantado", forms: { pres: ["levanto", "levantas", "levanta", "levantamos", "levantáis", "levantan"] } },
  },
};

describe("conjugate", () => {
  it("uses the table when present", () => {
    const c = conjugate(table, "ser", "pres");
    expect(c?.source).toBe("table");
    expect(c?.forms[0]).toBe("soy");
    expect(isIrregular(table, "ser")).toBe(true);
  });

  it("falls back to regular rules", () => {
    const c = conjugate(table, "trabajar", "pret");
    expect(c?.source).toBe("regular");
    expect(c?.forms).toEqual(["trabajé", "trabajaste", "trabajó", "trabajamos", "trabajasteis", "trabajaron"]);
    expect(isIrregular(table, "trabajar")).toBeUndefined();
  });

  it("adds reflexive pronouns for -se verbs", () => {
    const c = conjugate(table, "levantarse", "pres");
    expect(c?.reflexive).toBe(true);
    expect(c?.forms[0]).toBe("me levanto");
    expect(c?.forms[3]).toBe("nos levantamos");
  });
});
