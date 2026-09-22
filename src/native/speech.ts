/**
 * Facade over the in-app SpeechPlugin (SFSpeechRecognizer, on-device).
 * Events: `partial { text, isFinal }` while listening, `end { text, reason, error? }` once.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { toNativeError } from "./platform";

export interface SpeechStartOptions {
  locale: string;
  contextualStrings?: string[];
  maxSeconds?: number;
  silenceSeconds?: number;
  onDevice?: boolean;
  taskHint?: "dictation" | "confirmation" | "search";
}

export type SpeechEndReason = "final" | "silence" | "timeout" | "stopped" | "error";

interface SpeechPlugin {
  available(o: { locale: string }): Promise<{ available: boolean; onDevice: boolean; authorized: boolean }>;
  authorize(): Promise<{ speech: boolean; microphone: boolean }>;
  start(o: SpeechStartOptions): Promise<void>;
  stop(): Promise<{ text: string }>;
  addListener(event: "partial", fn: (e: { text: string; isFinal: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: "end", fn: (e: { text: string; reason: SpeechEndReason; error?: string }) => void): Promise<PluginListenerHandle>;
}

const Speech = registerPlugin<SpeechPlugin>("Speech");

export async function speechAvailable(locale: string) {
  try {
    return await Speech.available({ locale });
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function speechRequestPermissions() {
  try {
    return await Speech.authorize();
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function speechStart(o: SpeechStartOptions) {
  try {
    await Speech.start(o);
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function speechStop(): Promise<string> {
  try {
    return (await Speech.stop()).text;
  } catch (e) {
    throw toNativeError(e);
  }
}

export function onSpeechPartial(fn: (e: { text: string; isFinal: boolean }) => void): () => void {
  const h = Speech.addListener("partial", fn);
  return () => void h.then((x) => x.remove());
}

export function onSpeechEnd(fn: (e: { text: string; reason: SpeechEndReason; error?: string }) => void): () => void {
  const h = Speech.addListener("end", fn);
  return () => void h.then((x) => x.remove());
}
