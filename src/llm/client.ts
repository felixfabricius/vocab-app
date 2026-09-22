/**
 * Claude client for the browser. The key lives in settings on this phone only.
 * Every call: structured outputs, low effort, refusal fallback, usage metering.
 *
 * Before any second user exists, this moves behind a server endpoint.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { LlmUsage, Settings } from "@/core/types";
import { estimateUsd, type UsageDelta } from "./pricing";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export interface LlmCall<T> {
  system: string;
  user: ContentPart[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}

export interface LlmResult<T> {
  data: T;
  usage: UsageDelta;
  usd: number;
  model: string;
}

export class SpendCapError extends Error {}
export class NoApiKeyError extends Error {}

export interface LlmEnv {
  getSettings: () => Promise<Settings>;
  saveSettings: (patch: Partial<Settings>) => Promise<Settings>;
}

function month(d: Date): string {
  return d.toISOString().slice(0, 7);
}
function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function rollUsage(prev: LlmUsage | undefined, delta: UsageDelta, usd: number, now = new Date()): LlmUsage {
  const m = month(now);
  const dy = day(now);
  const base: LlmUsage =
    prev && prev.month === m
      ? prev
      : { month: m, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0, day: dy, todayUsd: 0 };
  const todayUsd = base.day === dy ? base.todayUsd + usd : usd;
  return {
    month: m,
    calls: base.calls + 1,
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    cacheReadTokens: base.cacheReadTokens + delta.cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + delta.cacheWriteTokens,
    usd: base.usd + usd,
    day: dy,
    todayUsd,
  };
}

export function checkSpendCap(settings: Settings, now = new Date()): "ok" | "warn" | "stop" {
  const u = settings.llmUsage;
  if (!u || u.day !== day(now)) return "ok";
  if (u.todayUsd >= settings.dailySpendCapUsd * 2) return "stop";
  if (u.todayUsd >= settings.dailySpendCapUsd) return "warn";
  return "ok";
}

export async function callClaude<T>(env: LlmEnv, call: LlmCall<T>): Promise<LlmResult<T>> {
  const settings = await env.getSettings();
  if (!settings.anthropicKey) throw new NoApiKeyError("Add your Anthropic API key in Settings");
  if (checkSpendCap(settings) === "stop") {
    throw new SpendCapError(`Daily spend cap reached ($${(settings.dailySpendCapUsd * 2).toFixed(2)}). Raise it in Settings.`);
  }

  const client = new Anthropic({ apiKey: settings.anthropicKey, dangerouslyAllowBrowser: true });
  const model = settings.model || "claude-opus-5";

  const content = call.user.map((p) =>
    p.type === "text"
      ? ({ type: "text", text: p.text } as const)
      : ({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } } as const),
  );

  // Server-side fallback exists for the Opus models only; Sonnet rejects the parameter.
  const opus = model.startsWith("claude-opus");
  const response = await client.beta.messages.parse({
    model,
    max_tokens: call.maxTokens ?? 16000,
    // Stable prefix first so it caches across calls; the per-request content comes after.
    system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: call.effort ?? "low", format: betaZodOutputFormat(call.schema) },
    ...(opus ? { betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: "claude-opus-4-8" }] } : {}),
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The response was cut off (too long). Try a smaller page or fewer items.");
  }
  const data = response.parsed_output;
  if (!data) throw new Error("The model returned output that did not match the expected format.");

  const u = response.usage;
  const delta: UsageDelta = {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
  const usd = estimateUsd(response.model, delta);
  await env.saveSettings({ llmUsage: rollUsage(settings.llmUsage, delta, usd) });
  return { data, usage: delta, usd, model: response.model };
}
