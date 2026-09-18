import type { Cefr, Priority } from "@/core/types";
import { LANGUAGE } from "@/config/language";

/** Frequency rank -> class, using the language's thresholds (exclusive upper bounds). */
export function priorityFromRank(rank: number | undefined): Priority {
  if (rank === undefined || !Number.isFinite(rank)) return "niche";
  const t = LANGUAGE.rankThresholds;
  if (rank < t.essential) return "essential";
  if (rank < t.core) return "core";
  if (rank < t.standard) return "standard";
  return "niche";
}

const CEFR_TO_PRIORITY: Record<Cefr, Priority> = {
  A1: "essential",
  A2: "core",
  B1: "standard",
  B2: "niche",
  C1: "niche",
  C2: "niche",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  essential: 0,
  core: 1,
  standard: 2,
  niche: 3,
};

export function lowerPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_ORDER[a] >= PRIORITY_ORDER[b] ? a : b;
}

/**
 * Phrase class from the LLM's CEFR estimate and usefulness (1-5), capped at the
 * class of the rarest content word (a phrase is never more common than its parts).
 */
export function priorityForPhrase(
  cefr: Cefr | undefined,
  usefulness: number | undefined,
  rarestComponentPriority: Priority | undefined,
): Priority {
  let p: Priority = cefr ? CEFR_TO_PRIORITY[cefr] : "standard";
  if (usefulness !== undefined && usefulness >= 5 && p === "core") p = "essential";
  if (usefulness !== undefined && usefulness <= 2 && p === "essential") p = "core";
  if (rarestComponentPriority) p = lowerPriority(p, rarestComponentPriority);
  return p;
}
