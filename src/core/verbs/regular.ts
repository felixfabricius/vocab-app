/**
 * LANG: regular Spanish conjugation for -ar / -er / -ir verbs.
 * Used as the fallback when a verb is not in the conjugation table, and by
 * the build script to decide which table verbs are irregular.
 * No path aliases here: the build script runs this file directly under Node.
 */

export type TenseId = "pres" | "pret" | "impf" | "cond" | "subjPres" | "imp" | "perf" | "fut" | "plusq" | "subjImpf";
export const TENSE_IDS: readonly TenseId[] = ["pres", "pret", "impf", "cond", "subjPres", "imp", "perf", "fut", "plusq", "subjImpf"];

/** Six persons: yo, tú, él/ella/usted, nosotros, vosotros, ellos/ustedes. Imperative has no yo form. */
export type Forms = [string, string, string, string, string, string];

const ENDINGS: Record<"ar" | "er" | "ir", Record<Exclude<TenseId, "perf" | "plusq">, Forms>> = {
  ar: {
    pres: ["o", "as", "a", "amos", "áis", "an"],
    pret: ["é", "aste", "ó", "amos", "asteis", "aron"],
    impf: ["aba", "abas", "aba", "ábamos", "abais", "aban"],
    fut: ["aré", "arás", "ará", "aremos", "aréis", "arán"],
    cond: ["aría", "arías", "aría", "aríamos", "aríais", "arían"],
    subjPres: ["e", "es", "e", "emos", "éis", "en"],
    subjImpf: ["ara", "aras", "ara", "áramos", "arais", "aran"],
    imp: ["", "a", "e", "emos", "ad", "en"],
  },
  er: {
    pres: ["o", "es", "e", "emos", "éis", "en"],
    pret: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    impf: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    fut: ["eré", "erás", "erá", "eremos", "eréis", "erán"],
    cond: ["ería", "erías", "ería", "eríamos", "eríais", "erían"],
    subjPres: ["a", "as", "a", "amos", "áis", "an"],
    subjImpf: ["iera", "ieras", "iera", "iéramos", "ierais", "ieran"],
    imp: ["", "e", "a", "amos", "ed", "an"],
  },
  ir: {
    pres: ["o", "es", "e", "imos", "ís", "en"],
    pret: ["í", "iste", "ió", "imos", "isteis", "ieron"],
    impf: ["ía", "ías", "ía", "íamos", "íais", "ían"],
    fut: ["iré", "irás", "irá", "iremos", "iréis", "irán"],
    cond: ["iría", "irías", "iría", "iríamos", "iríais", "irían"],
    subjPres: ["a", "as", "a", "amos", "áis", "an"],
    subjImpf: ["iera", "ieras", "iera", "iéramos", "ierais", "ieran"],
    imp: ["", "e", "a", "amos", "id", "an"],
  },
};

const HABER_PRES: Forms = ["he", "has", "ha", "hemos", "habéis", "han"];
const HABER_IMPF: Forms = ["había", "habías", "había", "habíamos", "habíais", "habían"];

export function verbClass(infinitive: string): "ar" | "er" | "ir" | undefined {
  const inf = infinitive.trim().toLowerCase().replace(/se$/, "");
  if (inf.endsWith("ar")) return "ar";
  if (inf.endsWith("er")) return "er";
  if (inf.endsWith("ir") || inf.endsWith("ír")) return "ir";
  return undefined;
}

export function participle(infinitive: string): string | undefined {
  const cls = verbClass(infinitive);
  if (!cls) return undefined;
  const stem = infinitive.trim().toLowerCase().replace(/se$/, "").slice(0, -2);
  return cls === "ar" ? `${stem}ado` : `${stem}ido`;
}

/** Regular forms for one tense, or undefined when the verb ending is not recognised. */
export function conjugateRegular(infinitive: string, tense: TenseId): Forms | undefined {
  const cls = verbClass(infinitive);
  if (!cls) return undefined;
  const inf = infinitive.trim().toLowerCase().replace(/se$/, "");
  const stem = inf.slice(0, -2);
  if (tense === "perf" || tense === "plusq") {
    const p = participle(inf);
    if (!p) return undefined;
    const aux = tense === "perf" ? HABER_PRES : HABER_IMPF;
    return aux.map((a) => `${a} ${p}`) as Forms;
  }
  const ends = ENDINGS[cls][tense];
  return ends.map((e, i) => {
    if (tense === "imp" && i === 0) return "";
    return orthographic(stem, e, cls);
  }) as Forms;
}

/**
 * Spelling adjustments that keep the sound regular: buscar → busqué, llegar → llegué,
 * empezar → empecé, coger → cojo, seguir → sigo. Verbs that need them are not irregular.
 * -ar verbs adjust before e; -er/-ir verbs adjust before a/o.
 */
export function orthographic(stem: string, ending: string, cls: "ar" | "er" | "ir"): string {
  const first = ending[0];
  if (!first) return stem + ending;
  if (cls === "ar" && "eé".includes(first)) {
    if (stem.endsWith("gu")) return `${stem.slice(0, -2)}gü${ending}`;
    if (stem.endsWith("c")) return `${stem.slice(0, -1)}qu${ending}`;
    if (stem.endsWith("g")) return `${stem.slice(0, -1)}gu${ending}`;
    if (stem.endsWith("z")) return `${stem.slice(0, -1)}c${ending}`;
  }
  if (cls !== "ar" && "aáo".includes(first)) {
    if (stem.endsWith("gu")) return `${stem.slice(0, -2)}g${ending}`;
    if (stem.endsWith("g")) return `${stem.slice(0, -1)}j${ending}`;
  }
  return stem + ending;
}
