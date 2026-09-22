/**
 * The shared extraction prompt. Rendered for two consumers:
 *  - `api`: sent to Claude with structured outputs (the schema enforces shape)
 *  - `paste`: copied into the Claude app by the user; the reply must contain a
 *    fenced JSON block headed VOCABAPP-IMPORT v2 that `parsePasteImport` reads
 * The prompt builders (series, textbook, book, context) live in `builders.ts`
 * and only set options here.
 */
import { VARIETY } from "@/config/variety";
import type { Chunking } from "@/core/types";

export const PASTE_HEADER = "VOCABAPP-IMPORT v2";
export const ACCEPTED_MARKERS = ["VOCABAPP-IMPORT v1", PASTE_HEADER];

export type PhrasePreference = "few" | "balanced" | "many";
export type Density = "unknown" | "content" | "all";

export interface ExtractPromptOptions {
  format: "api" | "paste";
  chunking: Chunking;
  knownLemmas: string[];
  ignoreLemmas: string[];
  /** e.g. "textbook page", "street sign", "subtitles of episode 3" */
  sourceHint?: string;
  /** cap on items for long free text; undefined = no cap */
  maxItems?: number;
  /** learner's native language for glosses */
  glossLanguage?: "English";
  /** how many items to aim for (guidance, not a hard cap) */
  targetCount?: number;
  /** how many of the items should be phrases (guidance) */
  phrasePreference?: PhrasePreference;
  /** skip the ~200 most common function and survival words */
  skipBasic?: boolean;
  /** book pages: which words to take */
  density?: Density;
  /** context builder: the situation to invent vocabulary for */
  situation?: string;
  /** batch tag echoed at the top level of the paste block */
  batchTag?: string;
}

const CHUNKING_TEXT: Record<Chunking, string> = {
  conservative:
    "Only create a phrase entry for idioms and fixed formulas whose meaning cannot be guessed from the words.",
  balanced:
    "Create a phrase entry when the Spanish is not predictable from its parts for an English speaker: idioms; verb+noun collocations where the verb choice is non-obvious (hacer planes, tomar una decisión, dar un paseo); verb+preposition patterns (soñar con, depender de, pensar en); fixed formulas (a lo mejor, por si acaso, qué tal); light-verb constructions (tener hambre). Do NOT chunk free combinations that translate word for word (comer una manzana).",
  generous:
    "Be generous with phrases: in addition to idioms and collocations, include common multi-word chunks a beginner would want to memorise as a unit (frequent verb+object pairs, greetings, connectors, question formulas). Still skip combinations that translate word for word.",
};

const PHRASE_PREFERENCE_TEXT: Record<PhrasePreference, string> = {
  few: "Mostly single words; include a phrase only when it is clearly a fixed expression (roughly one item in ten).",
  balanced: "Mix single words and phrases, roughly one phrase for every two or three words.",
  many: "Favour phrases, collocations and recurring expressions; single words only when they matter on their own (roughly half the items or more).",
};

const DENSITY_TEXT: Record<Density, string> = {
  unknown: "Take only the words and expressions a learner at this level is unlikely to know; skip everything an A1–A2 learner would already have.",
  content: "Take every content word (nouns, verbs, adjectives, adverbs) and expression except very basic ones; skip function words.",
  all: "Take everything: every content word and expression on the page, including basic ones, so nothing is missed.",
};

export function buildExtractPrompt(o: ExtractPromptOptions): string {
  const known = o.knownLemmas.slice(0, 2000);
  const limit = o.maxItems ?? o.targetCount;
  const cap = limit
    ? `Hard limit: ${limit} items, never more. Pick the ${limit} most useful first, then stop; fewer is fine when the source has less. Number the items with an \`n\` field starting at 1 and stop as soon as n reaches ${limit}.`
    : "Return every vocabulary item on the page or in the text; do not cap.";
  const lines: string[] = [];

  lines.push(
    "You extract Spanish vocabulary for a beginner's flashcard app. The learner is an English speaker learning Spanish as spoken in Chile.",
    "",
    "## Variety",
    VARIETY.llmWording,
    "Tag an item `regional: \"chile\"` only when the word or phrase itself is Chilean; everything else is `neutral`.",
    "",
    "## Input",
    o.sourceHint ? `The input is: ${o.sourceHint}.` : "The input is a photo or text containing Spanish.",
    "If there are several photos, they belong to the same source (not necessarily consecutive pages); read them all and return one combined list without duplicates.",
    o.situation
      ? `There is no source text. Invent the vocabulary and sentences a learner needs for this situation: ${o.situation}`
      : "It may mix Spanish with English or German (textbook glosses, translations). Use an adjacent English or German gloss as a hint for the meaning. Never create entries for English or German words. If the input is a two-column vocabulary list, one item per row.",
    "",
    "## Items",
    "One item per lemma + part of speech. The lemma is the dictionary form: infinitive for verbs, masculine singular for nouns and adjectives. Inflected forms found in the input are recorded as `sentence.target`, never as separate items.",
    "Same lemma with a different meaning: put both meanings in `senses` (one gloss each). Reflexive variants (irse, quedarse) are a sense with `reflexive: true` on the base verb, not a new item.",
    "Glosses are always English. When the source gives a German gloss, translate it to English; never output German anywhere.",
    "Skip: proper names, numbers written as digits, and anything in the known list or the ignore list below.",
    ...(o.skipBasic
      ? [
          "Also skip the roughly 200 most common function and survival words a beginner learns in the first weeks (articles, pronouns, prepositions, ser/estar/tener/ir/haber, numbers, days, greetings, sí/no/gracias/por favor).",
        ]
      : []),
    ...(o.density ? [DENSITY_TEXT[o.density]] : []),
    "Every noun must have both `gender` (m/f) and `article` (el/la); never leave them null for a noun. Give `plural` only when irregular. For verbs set `irregular`.",
    "",
    "## Phrases",
    CHUNKING_TEXT[o.chunking],
    ...(o.phrasePreference ? [PHRASE_PREFERENCE_TEXT[o.phrasePreference]] : []),
    "A phrase item has `isPhrase: true`, `pos: \"phrase\"`, and its lemma is the citation form (hacer planes, not hicimos planes).",
    "",
    "## Priority",
    "Assign `priority` from how useful the item is for everyday conversation at beginner level:",
    "- essential: the 500 most common words and survival phrases (ser, tener, ¿cuánto cuesta?)",
    "- core: very common vocabulary a learner needs in the first months (frequency rank roughly 500–2000)",
    "- standard: common but not urgent (rank 2000–10000)",
    "- niche: rare, technical, literary, or highly specific",
    "Also give `cefr` (A1–C2) and `usefulness` 1–5 for conversation. A phrase is never more common than its rarest content word.",
    "",
    "## Sentence",
    "Give exactly one `sentence` per item. If the item occurs in a sentence of the input, copy that sentence verbatim (subtitle line, textbook example) with an English translation and set `sentenceSource: \"source\"`. Otherwise write one and set `sentenceSource: \"generated\"`: 6–12 words, natural, everyday register, shows the item in its most typical use. Prefer common words; do not restrict yourself to the known list. Do not insert regional slang into sentences unless the item itself is regional.",
    "For verbs use a common conjugated form and report it in `verbForm`. Set `target` to the exact form of the item inside the sentence.",
    "For every other content word (noun, verb, adjective, adverb) in the sentence that is NOT in the known list, add a minimal entry to `fromSentence`: lemma, pos, one-line gloss, and `target` = its form in the sentence. Function words (articles, prepositions, pronouns, conjunctions) are not listed.",
    "",
    "## Notes",
    "Set `note` only when significant: false friend, ser/estar or por/para trap, regional usage, a confusable near-synonym, or a grammar quirk (agua takes el). Otherwise null.",
    "If a page number is visible, set `pageRef`.",
    "",
    "## Output",
    cap,
  );

  if (known.length > 0) {
    lines.push("", "## Known lemmas (skip these as items; they may appear in sentences)", known.join(", "));
  }
  if (o.ignoreLemmas.length > 0) {
    lines.push("", "## Ignore list (never suggest)", o.ignoreLemmas.join(", "));
  }

  if (o.format === "paste") {
    lines.push(
      "",
      "## Response format",
      `Reply with a single fenced JSON code block and nothing else. The first line inside the block must be the marker \`${PASTE_HEADER}\` as a JSON string field, like this:`,
      "```json",
      JSON.stringify(
        {
          marker: PASTE_HEADER,
          tag: o.batchTag ?? null,
          limit: limit ?? null,
          notes: null,
          items: [
            {
              n: 1,
              lemma: "hacer planes",
              pos: "phrase",
              isPhrase: true,
              gender: null,
              article: null,
              plural: null,
              senses: [{ gloss: "to make plans", reflexive: null }],
              priority: "core",
              cefr: "A2",
              usefulness: 4,
              regional: "neutral",
              note: null,
              irregular: null,
              sentence: {
                es: "Hicimos planes para el sábado.",
                en: "We made plans for Saturday.",
                target: "Hicimos planes",
                span: null,
                verbForm: "hicimos (pretérito)",
              },
              sentenceSource: "generated",
              fromSentence: [{ lemma: "sábado", pos: "noun", gloss: "Saturday", target: "sábado" }],
              pageRef: null,
            },
          ],
        },
        null,
        2,
      ),
      "```",
      `Every field must be present; use null when not applicable. Keep \`tag\` and \`limit\` exactly as given${o.batchTag ? "" : " (tag is null here)"}; the app discards items beyond the limit. \`pos\` is one of noun, verb, adj, adv, phrase, prep, conj, pron, interj, num, other. \`priority\` is essential, core, standard or niche. \`sentenceSource\` is "source" or "generated".`,
    );
  }

  return lines.join("\n");
}
