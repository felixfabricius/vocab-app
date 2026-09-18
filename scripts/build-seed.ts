/**
 * Builds public/seed/essential.json from the frequency list through Claude:
 * the top ~1,200 tokens are lemmatized, de-duplicated, glossed, and given one
 * example sentence each; the top 500 lemmas plus ~100 survival phrases are kept.
 *
 * Run once with an API key in the environment (costs roughly a dollar):
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/build-seed.ts
 * Review the JSON before committing; bump `version` so installed apps re-seed.
 * Merges with the hand-authored items already in the file (they win on conflict).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const FREQ = new URL("../.cache/es_50k.txt", import.meta.url);
const OUT = new URL("../public/seed/essential.json", import.meta.url);
const MODEL = process.env.SEED_MODEL ?? "claude-opus-5";
const TOP_TOKENS = 1200;
const KEEP_LEMMAS = 500;
const CHUNK = 80;

const Item = z.object({
  lemma: z.string(),
  pos: z.enum(["noun", "verb", "adj", "adv", "phrase", "prep", "conj", "pron", "interj", "num", "other"]),
  gender: z.enum(["m", "f"]).nullable(),
  article: z.string().nullable(),
  senses: z.array(z.string()).min(1),
  regional: z.enum(["neutral", "chile"]),
  irregular: z.boolean().nullable(),
  note: z.string().nullable(),
  sentence: z.object({ es: z.string(), en: z.string(), target: z.string() }),
  /** the input tokens this lemma covers (inflected forms), for de-duplication */
  covers: z.array(z.string()),
  skip: z.boolean(),
});
const Result = z.object({ items: z.array(Item) });

interface SeedItem {
  lemma: string;
  pos: string;
  gender?: "m" | "f";
  article?: string;
  senses: string[];
  frequencyRank?: number;
  regional?: "neutral" | "chile";
  note?: string;
  irregular?: boolean;
  sentence?: { es: string; en: string; target?: string };
}

const SYSTEM = `You prepare a beginner's Spanish flashcard seed for an English speaker learning Spanish as spoken in Chile.
Neutral Latin American Spanish as spoken in Chile; no slang in sentences unless the item itself is regional.
Input: a list of frequent tokens from subtitles (inflected forms, some names, some noise).
For each token decide the lemma (dictionary form) and part of speech. Merge tokens that share a lemma into one item and list them in \`covers\`.
Set \`skip: true\` for proper names, digits, interjections without meaning, and fragments; still return them so nothing is lost.
Articles, pronouns and prepositions are useful items at this level; keep them.
For nouns give gender and article. For verbs set irregular. Note only when significant (ser/estar, por/para, false friends, agua takes el).
One sentence per item: 6-12 words, everyday, shows the typical use; \`target\` = the exact form used in the sentence.
Glosses in English, short.`;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY");
  if (!existsSync(FREQ)) throw new Error("Run scripts/build-frequency.ts first (downloads the frequency list)");
  const tokens: { tok: string; rank: number }[] = [];
  let i = 0;
  for (const line of readFileSync(FREQ, "utf8").split("\n")) {
    const tok = line.split(" ")[0]?.trim();
    if (!tok) continue;
    i++;
    if (i > TOP_TOKENS) break;
    if (/^[a-záéíóúñü]+$/i.test(tok)) tokens.push({ tok, rank: i });
  }

  const client = new Anthropic();
  const byLemma = new Map<string, SeedItem>();
  for (let start = 0; start < tokens.length; start += CHUNK) {
    const chunk = tokens.slice(start, start + CHUNK);
    process.stdout.write(`chunk ${start / CHUNK + 1}/${Math.ceil(tokens.length / CHUNK)}… `);
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: chunk.map((t) => `${t.rank}\t${t.tok}`).join("\n") }],
      output_config: { effort: "low", format: zodOutputFormat(Result) },
    });
    const parsed = response.parsed_output;
    if (!parsed) throw new Error("unparseable response");
    for (const it of parsed.items) {
      if (it.skip) continue;
      const key = `${it.lemma.toLowerCase()}|${it.pos}`;
      const rank = Math.min(...it.covers.map((c) => chunk.find((t) => t.tok === c)?.rank ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
      const existing = byLemma.get(key);
      if (existing && (existing.frequencyRank ?? Infinity) <= rank) continue;
      byLemma.set(key, {
        lemma: it.lemma,
        pos: it.pos,
        ...(it.gender ? { gender: it.gender } : {}),
        ...(it.article ? { article: it.article } : {}),
        senses: it.senses,
        ...(Number.isFinite(rank) ? { frequencyRank: rank } : {}),
        regional: it.regional,
        ...(it.note ? { note: it.note } : {}),
        ...(it.irregular != null ? { irregular: it.irregular } : {}),
        sentence: it.sentence,
      });
    }
    console.log(`${byLemma.size} lemmas so far (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`);
  }

  const generated = [...byLemma.values()].sort((a, b) => (a.frequencyRank ?? Infinity) - (b.frequencyRank ?? Infinity)).slice(0, KEEP_LEMMAS);

  // Merge with the hand-authored file: existing items win, phrases are kept.
  const current = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { version: number; items: SeedItem[] }) : { version: 0, items: [] };
  const keys = new Set(current.items.map((x) => `${x.lemma.toLowerCase()}|${x.pos}`));
  const merged = [...current.items, ...generated.filter((g) => !keys.has(`${g.lemma.toLowerCase()}|${g.pos}`))];
  writeFileSync(OUT, JSON.stringify({ version: current.version + 1, items: merged }, null, 2), "utf8");
  console.log(`essential.json: ${merged.length} items (${generated.length} generated, version ${current.version + 1})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
