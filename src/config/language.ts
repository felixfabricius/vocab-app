/**
 * LANG: everything specific to Spanish as the target language lives here.
 * A second language would add a config object; code should read from this
 * object rather than hard-coding Spanish.
 */
import type { Lang } from "@/core/types";

export interface LanguageConfig {
  id: Lang;
  name: string;
  /** Path to the lemma -> frequency rank table (served from public/) */
  frequencyPath: string;
  /** Path to the conjugation table (served from public/) */
  verbsPath: string;
  /** Path to the seed list (served from public/) */
  seedPath: string;
  /** Priority thresholds by frequency rank (exclusive upper bounds) */
  rankThresholds: { essential: number; core: number; standard: number };
  /** Ordered tense plan (ids used by the conjugation table and paradigm cards) */
  tensePlan: { id: string; label: string }[];
  /** Person labels for paradigm cards, in table order */
  persons: { id: string; label: string; regionalNote?: string }[];
}

export const SPANISH: LanguageConfig = {
  id: "es",
  name: "Spanish",
  frequencyPath: "/data/frequency.json",
  verbsPath: "/data/verbs.json",
  seedPath: "/seed/essential.json",
  rankThresholds: { essential: 500, core: 2000, standard: 10000 },
  tensePlan: [
    { id: "pres", label: "Presente" },
    { id: "pret", label: "Pretérito" },
    { id: "impf", label: "Imperfecto" },
    { id: "cond", label: "Condicional" },
    { id: "subjPres", label: "Presente de subjuntivo" },
    { id: "imp", label: "Imperativo" },
    { id: "perf", label: "Pretérito perfecto" },
    { id: "fut", label: "Futuro" },
    { id: "plusq", label: "Pluscuamperfecto" },
    { id: "subjImpf", label: "Imperfecto de subjuntivo" },
  ],
  persons: [
    { id: "1s", label: "yo" },
    { id: "2s", label: "tú" },
    { id: "3s", label: "él / ella / usted" },
    { id: "1p", label: "nosotros" },
    { id: "2p", label: "vosotros", regionalNote: "Spain" }, // VARIETY
    { id: "3p", label: "ellos / ellas / ustedes" },
  ],
};

export const LANGUAGE: LanguageConfig = SPANISH;
