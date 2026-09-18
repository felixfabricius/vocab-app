/**
 * Builds public/data/verbs.json from the Fred Jehle Spanish verb database
 * (CC BY-NC-SA 3.0, compiled by @ghidinelli). Run: node scripts/build-verbs.ts
 * Downloads the CSV on first run into .cache/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { conjugateRegular, type Forms, type TenseId } from "../src/core/verbs/regular.ts";

const URL_CSV = "https://raw.githubusercontent.com/ghidinelli/fred-jehle-spanish-verbs/master/jehle_verb_database.csv";
const CACHE = new URL("../.cache/jehle_verb_database.csv", import.meta.url);
const OUT = new URL("../public/data/verbs.json", import.meta.url);

const TENSE_MAP: Record<string, TenseId> = {
  "Indicativo|Presente": "pres",
  "Indicativo|Pretérito": "pret",
  "Indicativo|Imperfecto": "impf",
  "Indicativo|Condicional": "cond",
  "Indicativo|Futuro": "fut",
  "Indicativo|Pretérito perfecto": "perf",
  "Indicativo|Pluscuamperfecto": "plusq",
  "Subjuntivo|Presente": "subjPres",
  "Subjuntivo|Imperfecto": "subjImpf",
  "Imperativo Afirmativo|Presente": "imp",
};

/** Tenses whose regularity decides the `irregular` flag (compound tenses follow the participle). */
const REGULARITY_TENSES: TenseId[] = ["pres", "pret", "impf", "fut", "cond", "subjPres", "imp"];

interface VerbOut {
  en: string;
  irregular: boolean;
  gerund: string;
  participle: string;
  forms: Partial<Record<TenseId, Forms>>;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows.shift()!;
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

async function main() {
  if (!existsSync(CACHE)) {
    mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true });
    const res = await fetch(URL_CSV);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    writeFileSync(CACHE, await res.text(), "utf8");
  }
  const rows = parseCsv(readFileSync(CACHE, "utf8"));
  const verbs = new Map<string, VerbOut>();
  for (const r of rows) {
    const tense = TENSE_MAP[`${r.mood}|${r.tense}`];
    if (!tense) continue;
    const inf = r.infinitive!.trim();
    let v = verbs.get(inf);
    if (!v) {
      v = { en: r.infinitive_english ?? "", irregular: false, gerund: r.gerund ?? "", participle: r.pastparticiple ?? "", forms: {} };
      verbs.set(inf, v);
    }
    const forms: Forms = [r.form_1s ?? "", r.form_2s ?? "", r.form_3s ?? "", r.form_1p ?? "", r.form_2p ?? "", r.form_3p ?? ""];
    v.forms[tense] = forms;
  }

  let irregularCount = 0;
  for (const [inf, v] of verbs) {
    let irregular = false;
    for (const t of REGULARITY_TENSES) {
      const actual = v.forms[t];
      const regular = conjugateRegular(inf, t);
      if (!actual || !regular) continue;
      for (let i = 0; i < 6; i++) {
        if (t === "imp" && i === 0) continue; // no yo imperative
        const a = actual[i]!.trim().toLowerCase();
        if (!a) continue;
        if (a !== regular[i]!) {
          irregular = true;
          break;
        }
      }
      if (irregular) break;
    }
    if (!irregular && v.participle && v.participle.toLowerCase() !== (conjugateRegular(inf, "perf")?.[0] ?? "").replace(/^he /, "")) {
      irregular = true; // irregular participle (abrir → abierto)
    }
    v.irregular = irregular;
    if (irregular) irregularCount++;
  }

  const out = {
    source: "Fred Jehle Spanish Verb Database, compiled by ghidinelli (CC BY-NC-SA 3.0)",
    tenses: Object.values(TENSE_MAP),
    verbs: Object.fromEntries([...verbs.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
  mkdirSync(new URL("../public/data/", import.meta.url), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out), "utf8");
  console.log(`verbs.json: ${verbs.size} verbs, ${irregularCount} irregular`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
