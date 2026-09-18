import type { LlmEnv } from "@/llm/client";
import type { DraftContext } from "@/llm/pipelines";
import { repo } from "./services";

export const llmEnv: LlmEnv = {
  getSettings: () => repo.getSettings(),
  saveSettings: (patch) => repo.saveSettings(patch),
};

/** Known lemmas (most recent first, capped) and the ignore list, for the extraction prompt. */
export async function draftContext(): Promise<DraftContext> {
  const [settings, entries, ignore] = await Promise.all([repo.getSettings(), repo.allActiveEntriesById(), repo.ignoreKeys()]);
  const known = [...entries.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 2000)
    .map((e) => e.lemma);
  const ignoreLemmas = [...ignore].map((k) => k.split("|")[0] ?? k);
  return { settings, knownLemmas: known, ignoreLemmas };
}
