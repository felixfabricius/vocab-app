/**
 * Builds public/data/frequency.json (token -> rank, top N) from hermitdave's
 * FrequencyWords Spanish list (OpenSubtitles 2018, CC BY-SA 4.0).
 * Verb infinitives from verbs.json get the rank of their most frequent form,
 * so "ser" ranks like "es" rather than like the rarely-spoken infinitive.
 * Run: node scripts/build-frequency.ts   (after build-verbs)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const URL_TXT = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt";
const CACHE = new URL("../.cache/es_50k.txt", import.meta.url);
const VERBS = new URL("../public/data/verbs.json", import.meta.url);
const OUT = new URL("../public/data/frequency.json", import.meta.url);
const TOP = 20000;

async function main() {
  if (!existsSync(CACHE)) {
    mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true });
    const res = await fetch(URL_TXT);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    writeFileSync(CACHE, await res.text(), "utf8");
  }
  const rank = new Map<string, number>();
  let i = 0;
  for (const line of readFileSync(CACHE, "utf8").split("\n")) {
    const tok = line.split(" ")[0]?.trim();
    if (!tok) continue;
    i++;
    if (i > TOP) break;
    if (!rank.has(tok)) rank.set(tok, i);
  }

  if (existsSync(VERBS)) {
    const data = JSON.parse(readFileSync(VERBS, "utf8")) as { verbs: Record<string, { forms: Record<string, string[]> }> };
    for (const [inf, v] of Object.entries(data.verbs)) {
      let best = rank.get(inf) ?? Number.POSITIVE_INFINITY;
      for (const forms of Object.values(v.forms)) {
        for (const f of forms) {
          const r = rank.get(f.toLowerCase());
          if (r !== undefined && r < best) best = r;
        }
      }
      if (Number.isFinite(best)) rank.set(inf, best);
    }
  }

  const out = { source: "hermitdave/FrequencyWords es 2018 (CC BY-SA 4.0)", top: TOP, rank: Object.fromEntries(rank) };
  writeFileSync(OUT, JSON.stringify(out), "utf8");
  console.log(`frequency.json: ${rank.size} tokens`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
