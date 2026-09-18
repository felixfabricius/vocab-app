/** USD per million tokens. Cache reads are 10% of input, cache writes 125%. */
export interface ModelPrice {
  input: number;
  output: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-4-8": { input: 5, output: 25 },
};

export const MODEL_CHOICES = [
  { id: "claude-opus-5", label: "Claude Opus 5 (default)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (cheaper)" },
];

export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function estimateUsd(model: string, u: UsageDelta): number {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES["claude-opus-5"]!;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.input * 0.1 +
      u.cacheWriteTokens * p.input * 1.25) /
    1_000_000
  );
}
