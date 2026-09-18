/**
 * First-launch seed: imports public/seed/essential.json into the database.
 * Idempotent per seed version (settings.seedVersion).
 */
import { LANGUAGE } from "@/config/language";
import { newId, nowIso } from "@/core/ids";
import { missingProductionCards } from "@/core/generator/cards";
import { priorityFromRank } from "@/core/priority/rank";
import type { Card, Encounter, Entry, Pos, Regional, Sense, Sentence, Source } from "@/core/types";
import type { Repository } from "@/storage/Repository";

export interface SeedItem {
  lemma: string;
  pos: Pos;
  isPhrase?: boolean;
  gender?: "m" | "f";
  article?: string;
  plural?: string;
  senses: string[];
  frequencyRank?: number;
  regional?: Regional;
  note?: string;
  irregular?: boolean;
  sentence?: { es: string; en: string; target?: string };
}

export interface SeedFile {
  version: number;
  items: SeedItem[];
}

export function spanFor(sentence: string, target: string | undefined): [number, number] | undefined {
  if (!target) return undefined;
  const i = sentence.toLowerCase().indexOf(target.toLowerCase());
  return i >= 0 ? [i, i + target.length] : undefined;
}

export async function seedIfNeeded(repo: Repository, fetchSeed = defaultFetch): Promise<number> {
  const settings = await repo.getSettings();
  const seed = await fetchSeed();
  if (!seed || (settings.seedVersion ?? 0) >= seed.version) return 0;
  const count = await applySeed(repo, seed);
  await repo.saveSettings({ seedVersion: seed.version });
  return count;
}

async function defaultFetch(): Promise<SeedFile | undefined> {
  try {
    const res = await fetch(LANGUAGE.seedPath);
    if (!res.ok) return undefined;
    return (await res.json()) as SeedFile;
  } catch {
    return undefined;
  }
}

export async function applySeed(repo: Repository, seed: SeedFile): Promise<number> {
  const at = nowIso();
  const source: Source = { id: newId(), type: "seed", label: `Seed v${seed.version}`, createdAt: at };
  await repo.putSource(source);

  const entries: Entry[] = [];
  const senses: Sense[] = [];
  const sentences: Sentence[] = [];
  const encounters: Encounter[] = [];
  const cards: Card[] = [];
  const env = { now: () => new Date(), newId };
  let added = 0;

  for (const item of seed.items) {
    const existing = await repo.findEntry(item.lemma, item.pos);
    if (existing) continue;
    const entry: Entry = {
      id: newId(),
      lang: LANGUAGE.id,
      lemma: item.lemma,
      pos: item.pos,
      isPhrase: item.isPhrase ?? item.pos === "phrase",
      ...(item.gender ? { gender: item.gender } : {}),
      ...(item.article ? { article: item.article } : {}),
      ...(item.plural ? { plural: item.plural } : {}),
      priority: item.frequencyRank !== undefined ? priorityFromRank(item.frequencyRank) : "essential",
      priorityAuto: true,
      ...(item.frequencyRank !== undefined ? { frequencyRank: item.frequencyRank } : {}),
      regional: item.regional ?? "neutral",
      ...(item.note ? { note: item.note } : {}),
      tags: ["seed"],
      ...(item.pos === "verb" ? { verb: { irregular: item.irregular ?? false, paradigmCards: "auto" as const } } : {}),
      status: "active",
      sourceIds: [source.id],
      createdAt: at,
      updatedAt: at,
    };
    // Seed items are Essential by definition even if their rank says otherwise.
    entry.priority = "essential";
    entries.push(entry);

    const entrySenses = item.senses.map((gloss, order) => ({
      id: newId(),
      entryId: entry.id,
      gloss,
      order,
      createdAt: at,
      updatedAt: at,
    }));
    senses.push(...entrySenses);

    if (item.sentence) {
      const sentence: Sentence = {
        id: newId(),
        es: item.sentence.es,
        en: item.sentence.en,
        origin: "generated",
        sourceId: source.id,
        createdAt: at,
        updatedAt: at,
      };
      sentences.push(sentence);
      const span = spanFor(item.sentence.es, item.sentence.target ?? item.lemma);
      encounters.push({
        id: newId(),
        entryId: entry.id,
        sentenceId: sentence.id,
        ...(span ? { span } : {}),
        ...(item.sentence.target ? { form: item.sentence.target } : {}),
        createdAt: at,
      });
    }
    cards.push(...missingProductionCards(entry, entrySenses, [], env));
    added++;
  }

  await repo.putEntries(entries);
  await repo.putSenses(senses);
  await repo.putSentences(sentences);
  await repo.putEncounters(encounters);
  await repo.putCards(cards);
  return added;
}
