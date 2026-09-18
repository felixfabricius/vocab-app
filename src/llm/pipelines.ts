/**
 * Drafting pipelines: input → EntryDraft[]. Each one renders the shared prompt,
 * calls Claude with the matching schema, and normalizes the result.
 */
import type { EntryDraft, Settings } from "@/core/types";
import { callClaude, type LlmEnv, type LlmResult } from "./client";
import { buildExtractPrompt } from "./prompts/extract";
import { ExtractResultSchema, ScanResultSchema, TranslateResultSchema, normalizeDraft, type ScanResult } from "./schema";
import type { PreparedImage } from "./image";
import { VARIETY } from "@/config/variety";

export interface DraftContext {
  settings: Settings;
  knownLemmas: string[];
  ignoreLemmas: string[];
}

export interface DraftOutput {
  drafts: EntryDraft[];
  notes?: string;
  usd: number;
  model: string;
}

/** Above this many words, text goes through the scan stage first. */
export const SCAN_THRESHOLD_WORDS = 400;

function finish(r: LlmResult<{ items: unknown[]; notes: string | null }>, drafts: EntryDraft[]): DraftOutput {
  return { drafts, ...(r.data.notes ? { notes: r.data.notes } : {}), usd: r.usd, model: r.model };
}

export async function draftFromImage(env: LlmEnv, ctx: DraftContext, image: PreparedImage, sourceHint = "a photo of a textbook or book page, sign, or menu"): Promise<DraftOutput> {
  const system = buildExtractPrompt({
    format: "api",
    chunking: ctx.settings.chunking,
    knownLemmas: ctx.knownLemmas,
    ignoreLemmas: ctx.ignoreLemmas,
    sourceHint,
  });
  const r = await callClaude(env, {
    system,
    user: [
      { type: "image", mediaType: image.mediaType, base64: image.base64 },
      { type: "text", text: "Extract the vocabulary from this image." },
    ],
    schema: ExtractResultSchema,
  });
  return finish(r, r.data.items.map(normalizeDraft));
}

export async function draftFromText(env: LlmEnv, ctx: DraftContext, text: string, opts: { sourceHint?: string; maxItems?: number } = {}): Promise<DraftOutput> {
  const system = buildExtractPrompt({
    format: "api",
    chunking: ctx.settings.chunking,
    knownLemmas: ctx.knownLemmas,
    ignoreLemmas: ctx.ignoreLemmas,
    sourceHint: opts.sourceHint ?? "pasted text",
    ...(opts.maxItems ? { maxItems: opts.maxItems } : {}),
  });
  const r = await callClaude(env, {
    system,
    user: [{ type: "text", text: `Extract the vocabulary from this text:\n\n${text}` }],
    schema: ExtractResultSchema,
    maxTokens: 32000,
  });
  return finish(r, r.data.items.map(normalizeDraft));
}

/**
 * Stage one for long text: a compact candidate list (lemma, pos, gloss, class, line)
 * without sentences. Accepted candidates are enriched afterwards.
 */
export async function scanText(
  env: LlmEnv,
  ctx: DraftContext,
  text: string,
  opts: { maxWords?: number; maxPhrases?: number; exclude?: string[]; sourceHint?: string } = {},
): Promise<{ candidates: ScanResult["candidates"]; lines: string[]; usd: number }> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbered = lines.map((l, i) => `${i}\t${l}`).join("\n");
  const maxWords = opts.maxWords ?? 60;
  const maxPhrases = opts.maxPhrases ?? 40;
  const system = [
    "You scan Spanish text for vocabulary worth learning, for an English speaker at beginner level learning Spanish as spoken in Chile.",
    VARIETY.llmWording,
    "Return a compact candidate list only: lemma (dictionary form), pos, a one-line English gloss, priority, and the index of one line where it occurs.",
    "Priority: essential = the 500 most common words and survival phrases; core = very common (rank 500–2000); standard = common (2000–10000); niche = rare.",
    "Phrases: idioms, verb+noun collocations with a non-obvious verb (hacer planes), verb+preposition patterns (soñar con), fixed formulas (a lo mejor). Not free combinations.",
    `Return at most ${maxWords} single words and ${maxPhrases} phrases, most useful first. Skip proper names, numbers, and everything in the known and ignore lists.`,
    ctx.knownLemmas.length ? `Known (skip): ${ctx.knownLemmas.slice(0, 2000).join(", ")}` : "",
    ctx.ignoreLemmas.length ? `Ignore (skip): ${ctx.ignoreLemmas.join(", ")}` : "",
    opts.exclude?.length ? `Already suggested (skip): ${opts.exclude.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await callClaude(env, {
    system,
    user: [{ type: "text", text: `${opts.sourceHint ? `Source: ${opts.sourceHint}\n\n` : ""}Lines (index<TAB>text):\n${numbered}` }],
    schema: ScanResultSchema,
    maxTokens: 16000,
  });
  return { candidates: r.data.candidates, lines, usd: r.usd };
}

/** A single word or phrase typed by the learner (Spanish or English). */
export async function draftManual(env: LlmEnv, ctx: DraftContext, input: string): Promise<DraftOutput> {
  const system = buildExtractPrompt({
    format: "api",
    chunking: ctx.settings.chunking,
    knownLemmas: [],
    ignoreLemmas: ctx.ignoreLemmas,
    sourceHint: "a single word or phrase typed by the learner; it may be English (then find the natural Spanish equivalent) or Spanish",
  });
  const r = await callClaude(env, {
    system,
    user: [{ type: "text", text: `Create the entry for: ${input}\nReturn exactly one item unless the input clearly has two distinct senses that need separate lemmas.` }],
    schema: ExtractResultSchema,
    maxTokens: 4000,
  });
  return finish(r, r.data.items.map(normalizeDraft));
}

export interface EnrichInput {
  lemma: string;
  pos: string;
  glosses: string[];
  /** a sentence the word was seen in, if any (so the model does not invent a different sense) */
  context?: string;
}

/** Fill in details for entries that were created without them (translate log, plain lines, scan candidates). */
export async function enrichEntries(env: LlmEnv, ctx: DraftContext, inputs: EnrichInput[]): Promise<DraftOutput> {
  const system = buildExtractPrompt({
    format: "api",
    chunking: ctx.settings.chunking,
    knownLemmas: ctx.knownLemmas,
    ignoreLemmas: [],
    sourceHint:
      "a list of items the learner already saved, each with its meaning. Return one item per input line, in the same order, keeping the given lemma and part of speech exactly (fix obvious typos in the lemma only if clearly wrong). Fill in everything else: gender, article, senses (keep the given meaning as the first sense), priority, regional tag, note, a generated sentence, and from-sentence words",
  });
  const list = inputs.map((i, n) => `${n + 1}. ${i.lemma} (${i.pos}) — ${i.glosses.join("; ")}${i.context ? ` [seen in: ${i.context}]` : ""}`).join("\n");
  const r = await callClaude(env, {
    system,
    user: [{ type: "text", text: `Enrich these items:\n${list}` }],
    schema: ExtractResultSchema,
    maxTokens: 32000,
  });
  return finish(r, r.data.items.map(normalizeDraft));
}

export interface TranslateOutput {
  translation: string;
  alternatives: string[];
  note?: string;
  draft?: EntryDraft;
  usd: number;
}

export async function translateWithClaude(env: LlmEnv, ctx: DraftContext, text: string, dir: "en-es" | "es-en"): Promise<TranslateOutput> {
  const system = [
    `You are a translator for an English speaker learning Spanish. ${VARIETY.llmWording}`,
    dir === "en-es"
      ? "Translate the English input into natural Spanish as a Chilean would say it in everyday conversation. Give up to two alternatives if register matters (formal / informal)."
      : "Translate the Spanish input into natural English. Give alternatives only if the phrase is ambiguous.",
    "Add a short `note` only if there is a trap (register, regional usage, false friend). Otherwise null.",
    "If the input is a single word or a short phrase worth learning, fill `draft` with a flashcard entry following these rules; otherwise null:",
    buildExtractPrompt({ format: "api", chunking: ctx.settings.chunking, knownLemmas: [], ignoreLemmas: [], sourceHint: "a word or phrase the learner looked up" }),
  ].join("\n\n");
  const r = await callClaude(env, {
    system,
    user: [{ type: "text", text }],
    schema: TranslateResultSchema,
    maxTokens: 4000,
  });
  const d = r.data;
  return {
    translation: d.translation,
    alternatives: d.alternatives,
    ...(d.note ? { note: d.note } : {}),
    ...(d.draft ? { draft: normalizeDraft(d.draft) } : {}),
    usd: r.usd,
  };
}
