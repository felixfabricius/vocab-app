/**
 * Conjugation lookup: the bundled table first, regular rules as fallback.
 * The table is fetched once and cached in memory (and by the service worker).
 */
import { LANGUAGE } from "@/config/language";
import { conjugateRegular, type Forms, type TenseId } from "./regular";

export type { Forms, TenseId };

export interface VerbRecord {
  en: string;
  irregular: boolean;
  gerund: string;
  participle: string;
  forms: Partial<Record<TenseId, Forms>>;
}

export interface VerbTable {
  verbs: Record<string, VerbRecord>;
}

let table: VerbTable | undefined;
let loading: Promise<VerbTable> | undefined;

export async function loadVerbTable(fetcher: () => Promise<VerbTable> = defaultFetch): Promise<VerbTable> {
  if (table) return table;
  if (!loading) {
    loading = fetcher()
      .then((t) => (table = t))
      .catch(() => (table = { verbs: {} }));
  }
  return loading;
}

async function defaultFetch(): Promise<VerbTable> {
  const res = await fetch(LANGUAGE.verbsPath);
  if (!res.ok) throw new Error(`verbs table ${res.status}`);
  return (await res.json()) as VerbTable;
}

/** For tests and scripts. */
export function setVerbTable(t: VerbTable | undefined) {
  table = t;
  loading = undefined;
}

function baseLemma(lemma: string): string {
  return lemma.trim().toLowerCase().replace(/se$/, "");
}

export function lookupVerb(t: VerbTable, lemma: string): VerbRecord | undefined {
  return t.verbs[lemma.trim().toLowerCase()] ?? t.verbs[baseLemma(lemma)];
}

export interface Conjugation {
  forms: Forms;
  source: "table" | "regular";
  reflexive: boolean;
}

const REFLEXIVE_PRONOUNS = ["me", "te", "se", "nos", "os", "se"];

export function conjugate(t: VerbTable, lemma: string, tense: TenseId): Conjugation | undefined {
  const reflexive = /se$/.test(lemma.trim().toLowerCase()) && lemma.trim().length > 4;
  const rec = lookupVerb(t, lemma);
  let forms: Forms | undefined = rec?.forms[tense];
  let source: Conjugation["source"] = "table";
  if (!forms) {
    forms = conjugateRegular(lemma, tense);
    source = "regular";
  }
  if (!forms) return undefined;
  if (reflexive && tense !== "imp") {
    forms = forms.map((f, i) => (f ? `${REFLEXIVE_PRONOUNS[i]} ${f}` : f)) as Forms;
  }
  return { forms, source, reflexive };
}

export function isIrregular(t: VerbTable, lemma: string): boolean | undefined {
  return lookupVerb(t, lemma)?.irregular;
}
