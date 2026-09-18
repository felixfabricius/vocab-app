import { describe, expect, it } from "vitest";
import { conjugateRegular, participle, verbClass } from "./regular";

describe("regular conjugation", () => {
  it("classifies verbs including reflexives", () => {
    expect(verbClass("hablar")).toBe("ar");
    expect(verbClass("comer")).toBe("er");
    expect(verbClass("vivir")).toBe("ir");
    expect(verbClass("levantarse")).toBe("ar");
    expect(verbClass("casa")).toBeUndefined();
  });

  it("conjugates the three model verbs in the present", () => {
    expect(conjugateRegular("hablar", "pres")).toEqual(["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"]);
    expect(conjugateRegular("comer", "pres")).toEqual(["como", "comes", "come", "comemos", "coméis", "comen"]);
    expect(conjugateRegular("vivir", "pres")).toEqual(["vivo", "vives", "vive", "vivimos", "vivís", "viven"]);
  });

  it("handles preterite, future, conditional, subjunctive and imperative", () => {
    expect(conjugateRegular("hablar", "pret")).toEqual(["hablé", "hablaste", "habló", "hablamos", "hablasteis", "hablaron"]);
    expect(conjugateRegular("comer", "fut")).toEqual(["comeré", "comerás", "comerá", "comeremos", "comeréis", "comerán"]);
    expect(conjugateRegular("vivir", "cond")).toEqual(["viviría", "vivirías", "viviría", "viviríamos", "viviríais", "vivirían"]);
    expect(conjugateRegular("hablar", "subjPres")).toEqual(["hable", "hables", "hable", "hablemos", "habléis", "hablen"]);
    expect(conjugateRegular("comer", "subjImpf")).toEqual(["comiera", "comieras", "comiera", "comiéramos", "comierais", "comieran"]);
    expect(conjugateRegular("vivir", "imp")).toEqual(["", "vive", "viva", "vivamos", "vivid", "vivan"]);
  });

  it("applies spelling changes that keep verbs regular", () => {
    expect(conjugateRegular("buscar", "pret")?.[0]).toBe("busqué");
    expect(conjugateRegular("llegar", "pret")?.[0]).toBe("llegué");
    expect(conjugateRegular("empezar", "pret")?.[0]).toBe("empecé");
    expect(conjugateRegular("buscar", "subjPres")?.[2]).toBe("busque");
    expect(conjugateRegular("coger", "pres")?.[0]).toBe("cojo");
    expect(conjugateRegular("coger", "pres")?.[1]).toBe("coges");
    expect(conjugateRegular("distinguir", "pres")?.[0]).toBe("distingo");
    expect(conjugateRegular("pagar", "pres")?.[0]).toBe("pago");
  });

  it("builds compound tenses with haber", () => {
    expect(participle("comer")).toBe("comido");
    expect(conjugateRegular("hablar", "perf")?.[0]).toBe("he hablado");
    expect(conjugateRegular("vivir", "plusq")?.[3]).toBe("habíamos vivido");
  });
});
