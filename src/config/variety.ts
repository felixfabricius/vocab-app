/**
 * VARIETY: everything specific to Chilean Spanish lives here. To support another
 * variety, add a config object and select it from settings.
 */
export interface VarietyConfig {
  id: string;
  /** BCP-47 locale for text-to-speech voice selection */
  ttsLocale: string;
  /** Fallback locales in preference order when no voice for ttsLocale exists */
  ttsFallbackLocales: string[];
  /** Locale for speech recognition / transcription */
  asrLocale: string;
  /** Wording inserted into LLM prompts */
  llmWording: string;
  /** Whether paradigm cards show the vosotros row by default */
  showVosotrosDefault: boolean;
  /** Tag used on entries that are regional to this variety */
  regionalTag: "chile";
}

export const CHILE: VarietyConfig = {
  id: "es-CL",
  ttsLocale: "es-CL",
  ttsFallbackLocales: ["es-MX", "es-US", "es-419", "es-AR", "es-CO", "es-ES", "es"],
  asrLocale: "es-CL",
  llmWording:
    "Neutral Latin American Spanish as spoken in Chile. Do not insert regional slang unless the target item itself is regional; when it is, tag it as regional.",
  showVosotrosDefault: true,
  regionalTag: "chile",
};

export const VARIETY: VarietyConfig = CHILE;
