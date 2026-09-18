/**
 * Drafting pipelines: input → EntryDraft[]. Each one renders the shared prompt,
 * calls Claude with the matching schema, and normalizes the result.
 */
import type { EntryDraft, Settings } from "@/core/types";
import { callClaude, type LlmEnv, type LlmResult } from "./client";
import { buildExtractPrompt } from "./prompts/extract";
import { ExtractResultSchema, TranslateResultSchema, normalizeDraft } from "./schema";
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
  const words = text.trim().split(/\s+/).length;
  const maxItems = opts.maxItems ?? (words > 400 ? 100 : undefined);
  const system = buildExtractPrompt({
    format: "api",
    chunking: ctx.settings.chunking,
    knownLemmas: ctx.knownLemmas,
    ignoreLemmas: ctx.ignoreLemmas,
    sourceHint: opts.sourceHint ?? "pasted text",
    ...(maxItems ? { maxItems } : {}),
  });
  const r = await callClaude(env, {
    system,
    user: [{ type: "text", text: `Extract the vocabulary from this text:\n\n${text}` }],
    schema: ExtractResultSchema,
    maxTokens: 32000,
  });
  return finish(r, r.data.items.map(normalizeDraft));
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
