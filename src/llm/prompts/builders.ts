/**
 * Prompt builders for the Claude-app path (SPEC-NATIVE §4b): each one is a set
 * of fields that turn into options for the shared extraction prompt, plus the
 * batch tag that the reply echoes and the app stores on every entry.
 */
import type { Chunking } from "@/core/types";
import { buildExtractPrompt, type Density, type PhrasePreference } from "./extract";

export interface BuilderContext {
  chunking: Chunking;
  knownLemmas: string[];
  ignoreLemmas: string[];
}

export interface BuiltPrompt {
  prompt: string;
  tag: string;
}

export interface SeriesFields {
  series: string;
  season?: string;
  episode?: string;
  tag?: string;
  targetCount?: number;
  phrasePreference?: PhrasePreference;
}

export function seriesTag(f: SeriesFields): string {
  const ep = [f.season ? `S${f.season}` : "", f.episode ? `E${f.episode}` : ""].join("");
  return (f.tag?.trim() || [f.series.trim(), ep].filter(Boolean).join(" ")).trim();
}

export function seriesPrompt(ctx: BuilderContext, f: SeriesFields): BuiltPrompt {
  const tag = seriesTag(f);
  const where = [f.series.trim(), f.season ? `season ${f.season}` : "", f.episode ? `episode ${f.episode}` : ""].filter(Boolean).join(", ");
  return {
    tag,
    prompt: buildExtractPrompt({
      format: "paste",
      ...ctx,
      sourceHint: `the subtitles (or a transcript) of ${where}. Take sentences from the subtitles themselves. Include collocations and recurring slang the characters use; very basic words are excluded`,
      targetCount: f.targetCount ?? 40,
      phrasePreference: f.phrasePreference ?? "balanced",
      skipBasic: true,
      batchTag: tag,
    }),
  };
}

export interface TextbookFields {
  book?: string;
  page?: string;
  tag?: string;
}

/** Book and page are optional; without them the tag is "textbook <date>". */
export function textbookTag(f: TextbookFields, today = new Date()): string {
  const fromFields = [f.book?.trim() ?? "", f.page?.trim() ? `p. ${f.page.trim()}` : ""].filter(Boolean).join(" ");
  return (f.tag?.trim() || fromFields || `textbook ${today.toISOString().slice(0, 10)}`).trim();
}

export function textbookPrompt(ctx: BuilderContext, f: TextbookFields): BuiltPrompt {
  const tag = textbookTag(f);
  const where = [f.book?.trim() ?? "", f.page?.trim() ? `page ${f.page.trim()}` : ""].filter(Boolean).join(", ");
  return {
    tag,
    prompt: buildExtractPrompt({
      format: "paste",
      ...ctx,
      sourceHint: `one or more photos of textbook pages${where ? ` (${where})` : ""}. Take everything on the pages: vocabulary lists, dialogue, exercises. Glosses in English; German glosses are translated and dropped`,
      batchTag: tag,
    }),
  };
}

export interface BookFields {
  book: string;
  tag?: string;
  density?: Density;
}

export function bookTag(f: BookFields): string {
  return (f.tag?.trim() || f.book.trim()).trim();
}

export function bookPrompt(ctx: BuilderContext, f: BookFields): BuiltPrompt {
  const tag = bookTag(f);
  return {
    tag,
    prompt: buildExtractPrompt({
      format: "paste",
      ...ctx,
      sourceHint: `a photo of a page from the book "${f.book.trim()}" (fiction or non-fiction). Copy the sentence each item occurs in`,
      density: f.density ?? "unknown",
      batchTag: tag,
    }),
  };
}

export interface ContextFields {
  situation: string;
  tag?: string;
  targetCount?: number;
}

export function contextTag(f: ContextFields): string {
  return (f.tag?.trim() || f.situation.trim().slice(0, 40)).trim();
}

export function contextPrompt(ctx: BuilderContext, f: ContextFields): BuiltPrompt {
  const tag = contextTag(f);
  return {
    tag,
    prompt: buildExtractPrompt({
      format: "paste",
      ...ctx,
      sourceHint: "a situation described by the learner, with no source text",
      situation: f.situation.trim(),
      targetCount: f.targetCount ?? 25,
      phrasePreference: "many",
      batchTag: tag,
    }),
  };
}
