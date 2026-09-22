/**
 * Voice review, level 1 (screen on): front spoken → pause → back spoken →
 * listen for sí / no / otra vez → grade. Silence: the back is repeated once,
 * then the card is skipped (buried for today, PLAN-NATIVE D5). Pure apart from
 * the injected `VoiceDeps`, so it is unit-tested with fakes; `VoiceInput`
 * binds it to the native player and recogniser.
 */
import type { InputHandlers } from "@/input/InputSource";

export type Answer = "good" | "again" | "repeat" | "none";

/** LANG / VARIETY: the answer vocabulary. */
export const ANSWER_WORDS = {
  good: ["sí", "si", "yes", "ya", "claro", "correcto"],
  again: ["no", "nope", "mal"],
  repeat: ["otra vez", "repite", "repeat", "again", "de nuevo"],
};
export const CONTEXTUAL_STRINGS = ["sí", "no", "otra vez"];

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function interpretAnswer(text: string): Answer {
  const t = ` ${fold(text).replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim()} `;
  if (!t.trim()) return "none";
  const has = (w: string) => t.includes(` ${fold(w)} `);
  if (ANSWER_WORDS.repeat.some(has)) return "repeat";
  if (ANSWER_WORDS.again.some(has)) return "again";
  if (ANSWER_WORDS.good.some(has)) return "good";
  return "none";
}

export type VoiceCue = "listen" | "good" | "again" | "repeat" | "skip";

export interface VoiceDeps {
  speak(text: string, lang?: string): Promise<void>;
  cancelSpeech(): void;
  /** resolves with the recognised text, "" on silence */
  listen(seconds: number): Promise<string>;
  wait(ms: number): Promise<void>;
  /** short audio confirmation; resolves when it has played */
  cue(cue: VoiceCue): Promise<void>;
}

export interface VoiceCard {
  /** English side, spoken first (a paradigm card's front is Spanish: lemma + tense) */
  front: string;
  frontLang?: string;
  /** Spanish side, spoken after the flip */
  back: string[];
}

export interface VoiceSettings {
  pauseSeconds: number;
  listenSeconds: number;
}

async function speakBack(deps: VoiceDeps, card: VoiceCard, signal: AbortSignal) {
  for (let i = 0; i < card.back.length; i++) {
    if (signal.aborted) return;
    if (i > 0) await deps.wait(400);
    await deps.speak(card.back[i]!);
  }
}

/** What the loop is doing, for a status line on the review screen. */
export type VoiceStatus =
  | { phase: "front" }
  | { phase: "pause" }
  | { phase: "back" }
  | { phase: "listening" }
  | { phase: "heard"; text: string; answer: Answer }
  | { phase: "silence"; attempt: number }
  | { phase: "skipped" }
  | { phase: "error"; message: string };

/** Runs one card. Resolves with what happened; the handlers have already been called. */
export async function runVoiceCard(
  deps: VoiceDeps,
  h: InputHandlers,
  card: VoiceCard,
  s: VoiceSettings,
  signal: AbortSignal,
  onStatus: (st: VoiceStatus) => void = () => undefined,
): Promise<"graded" | "skipped" | "cancelled"> {
  if (signal.aborted) return "cancelled";
  onStatus({ phase: "front" });
  await deps.speak(card.front, card.frontLang ?? "en-US"); // LANG: the learner's language
  if (signal.aborted) return "cancelled";
  onStatus({ phase: "pause" });
  await deps.wait(s.pauseSeconds * 1000);
  if (signal.aborted) return "cancelled";
  if (!h.isFlipped()) h.flip();
  onStatus({ phase: "back" });
  await speakBack(deps, card, signal);

  let silences = 0;
  for (;;) {
    if (signal.aborted) return "cancelled";
    onStatus({ phase: "listening" });
    await deps.cue("listen");
    const heard = await deps.listen(s.listenSeconds);
    if (signal.aborted) return "cancelled";
    const answer = interpretAnswer(heard);
    if (heard.trim()) onStatus({ phase: "heard", text: heard, answer });
    if (answer === "good" || answer === "again") {
      await deps.cue(answer);
      h.grade(answer, "voice");
      return "graded";
    }
    if (answer === "repeat") {
      await deps.cue("repeat");
      onStatus({ phase: "back" });
      await speakBack(deps, card, signal);
      continue;
    }
    silences++;
    if (silences >= 2) {
      onStatus({ phase: "skipped" });
      await deps.cue("skip");
      h.skip();
      return "skipped";
    }
    onStatus({ phase: "silence", attempt: silences });
    await speakBack(deps, card, signal);
  }
}
