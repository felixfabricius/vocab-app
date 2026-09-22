/**
 * Facade over the in-app TranslatePlugin (Apple Translation framework, offline once
 * the language packs are installed). EXT: translate — the default provider on iOS.
 */
import { registerPlugin } from "@capacitor/core";
import { toNativeError } from "./platform";

export type PackStatus = "installed" | "supported" | "unsupported";

interface TranslatePlugin {
  languages(): Promise<{ languages: string[] }>;
  status(o: { from: string; to: string }): Promise<{ status: PackStatus; from: string; to: string }>;
  prepare(o: { from: string; to: string }): Promise<void>;
  translate(o: { text: string; from: string; to: string }): Promise<{ text: string }>;
}

const Translate = registerPlugin<TranslatePlugin>("Translate");

/** Language codes handed to the framework. Region-less on purpose (PLAN-NATIVE M3). */
export const TRANSLATE_LANGS = { es: "es", en: "en" } as const; // LANG

export function langsFor(dir: "en-es" | "es-en"): { from: string; to: string } {
  return dir === "en-es" ? { from: TRANSLATE_LANGS.en, to: TRANSLATE_LANGS.es } : { from: TRANSLATE_LANGS.es, to: TRANSLATE_LANGS.en };
}

export async function packStatus(dir: "en-es" | "es-en"): Promise<PackStatus> {
  try {
    return (await Translate.status(langsFor(dir))).status;
  } catch (e) {
    throw toNativeError(e);
  }
}

/** Resolved pair and status, for diagnostics. */
export async function packDetails(dir: "en-es" | "es-en"): Promise<{ status: PackStatus; from: string; to: string }> {
  try {
    return await Translate.status(langsFor(dir));
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function translateLanguages(): Promise<string[]> {
  try {
    return (await Translate.languages()).languages;
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function preparePack(dir: "en-es" | "es-en"): Promise<void> {
  try {
    await Translate.prepare(langsFor(dir));
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function translateOffline(text: string, dir: "en-es" | "es-en"): Promise<string> {
  try {
    return (await Translate.translate({ text, ...langsFor(dir) })).text;
  } catch (e) {
    throw toNativeError(e);
  }
}
