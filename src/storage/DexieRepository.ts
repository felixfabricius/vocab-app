import type { Table } from "dexie";
import {
  DEFAULT_SETTINGS,
  type Card,
  type Encounter,
  type Entry,
  type IgnoreEntry,
  type ImportBatch,
  type Lookup,
  type ReviewLog,
  type Sense,
  type Sentence,
  type Settings,
  type Source,
  type Suggestion,
  type TensePlanRow,
} from "@/core/types";
import type { EntryBundle, Repository } from "./Repository";
import { getDb, type VocabDB } from "./db";

const EXPORT_TABLES = [
  "entries",
  "senses",
  "sentences",
  "encounters",
  "cards",
  "reviewLogs",
  "sources",
  "importBatches",
  "suggestions",
  "ignoreList",
  "tensePlan",
  "settings",
  "lookups",
] as const;

type ExportTable = (typeof EXPORT_TABLES)[number];

export class DexieRepository implements Repository {
  constructor(private readonly db: VocabDB = getDb()) {}

  private table(name: ExportTable): Table<{ [k: string]: unknown }, string> {
    return this.db.table(name) as Table<{ [k: string]: unknown }, string>;
  }

  async getSettings(): Promise<Settings> {
    const s = await this.db.settings.get("settings");
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const next: Settings = { ...current, ...patch, id: "settings", updatedAt: new Date().toISOString() };
    await this.db.settings.put(next);
    return next;
  }

  getEntry(id: string) {
    return this.db.entries.get(id);
  }

  findEntry(lemma: string, pos: string) {
    return this.db.entries.where("[lemma+pos]").equals([lemma, pos]).first();
  }

  async listEntries(filter: { status?: Entry["status"]; search?: string; tag?: string; limit?: number } = {}) {
    let coll = filter.tag
      ? this.db.entries.where("tags").equals(filter.tag)
      : filter.status
        ? this.db.entries.where("status").equals(filter.status)
        : this.db.entries.toCollection();
    if (filter.tag && filter.status) {
      const status = filter.status;
      coll = coll.filter((e) => e.status === status);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      coll = coll.filter((e) => e.lemma.toLowerCase().includes(q));
    }
    const rows = await coll.toArray();
    rows.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }

  async allActiveEntriesById() {
    const rows = await this.db.entries.where("status").equals("active").toArray();
    return new Map(rows.map((e) => [e.id, e]));
  }

  async allTags() {
    const rows = await this.db.entries.where("status").equals("active").toArray();
    const counts = new Map<string, number>();
    for (const e of rows) for (const t of e.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  putLookups(rows: Lookup[]) {
    return this.db.lookups.bulkPut(rows).then(() => undefined);
  }
  async listLookups(filter: { unconsumed?: boolean; limit?: number } = {}) {
    let rows = await this.db.lookups.orderBy("at").reverse().toArray();
    if (filter.unconsumed) rows = rows.filter((r) => !r.consumedAt);
    return filter.limit ? rows.slice(0, filter.limit) : rows;
  }
  countUnconsumedLookups() {
    return this.db.lookups.filter((r) => !r.consumedAt).count();
  }
  async markLookupsConsumed(ids: string[], batchId: string, at: string) {
    await this.db.lookups.where("id").anyOf(ids).modify({ consumedAt: at, batchId });
  }

  async getBundle(entryId: string): Promise<EntryBundle | undefined> {
    const entry = await this.db.entries.get(entryId);
    if (!entry) return undefined;
    const [senses, cards, encounters] = await Promise.all([
      this.db.senses.where("entryId").equals(entryId).toArray(),
      this.db.cards.where("entryId").equals(entryId).toArray(),
      this.db.encounters.where("entryId").equals(entryId).toArray(),
    ]);
    senses.sort((a, b) => a.order - b.order);
    const sentences = (
      await this.db.sentences.bulkGet(encounters.map((e) => e.sentenceId))
    ).filter((s): s is Sentence => !!s);
    return { entry, senses, cards, encounters, sentences };
  }

  putEntry(entry: Entry) {
    return this.db.entries.put(entry).then(() => undefined);
  }
  putEntries(entries: Entry[]) {
    return this.db.entries.bulkPut(entries).then(() => undefined);
  }
  putSenses(senses: Sense[]) {
    return this.db.senses.bulkPut(senses).then(() => undefined);
  }
  deleteSense(id: string) {
    return this.db.senses.delete(id);
  }
  putSentences(sentences: Sentence[]) {
    return this.db.sentences.bulkPut(sentences).then(() => undefined);
  }
  putEncounters(encounters: Encounter[]) {
    return this.db.encounters.bulkPut(encounters).then(() => undefined);
  }

  async sentencesForEntry(entryId: string) {
    const encounters = await this.db.encounters.where("entryId").equals(entryId).toArray();
    const sentences = await this.db.sentences.bulkGet(encounters.map((e) => e.sentenceId));
    const out: { sentence: Sentence; encounter: Encounter }[] = [];
    encounters.forEach((encounter, i) => {
      const sentence = sentences[i];
      if (sentence) out.push({ sentence, encounter });
    });
    out.sort((a, b) => (a.sentence.origin === "source" ? -1 : 1) - (b.sentence.origin === "source" ? -1 : 1));
    return out;
  }

  async entryIdsWithoutSentences() {
    const [entries, encounters] = await Promise.all([
      this.db.entries.where("status").equals("active").toArray(),
      this.db.encounters.toArray(),
    ]);
    const has = new Set(encounters.map((e) => e.entryId));
    return entries.filter((e) => !has.has(e.id)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((e) => e.id);
  }

  async trashEntry(entryId: string, at: string) {
    await this.db.transaction("rw", this.db.entries, this.db.cards, async () => {
      await this.db.entries.update(entryId, { status: "trashed", deletedAt: at, updatedAt: at });
      await this.db.cards.where("entryId").equals(entryId).modify({ status: "suspended", updatedAt: at });
    });
  }

  async restoreEntry(entryId: string, at: string) {
    await this.db.transaction("rw", this.db.entries, this.db.cards, async () => {
      await this.db.entries.update(entryId, { status: "active", deletedAt: undefined, updatedAt: at });
      await this.db.cards.where("entryId").equals(entryId).modify({ status: "active", updatedAt: at });
    });
  }

  async purgeTrashedBefore(iso: string) {
    const rows = await this.db.entries.where("status").equals("trashed").toArray();
    const old = rows.filter((e) => e.deletedAt && e.deletedAt < iso);
    await this.db.transaction(
      "rw",
      [this.db.entries, this.db.senses, this.db.cards, this.db.encounters],
      async () => {
        for (const e of old) {
          await this.db.senses.where("entryId").equals(e.id).delete();
          await this.db.cards.where("entryId").equals(e.id).delete();
          await this.db.encounters.where("entryId").equals(e.id).delete();
          await this.db.entries.delete(e.id);
        }
      },
    );
    return old.length;
  }

  allCards() {
    return this.db.cards.toArray();
  }
  cardsForEntry(entryId: string) {
    return this.db.cards.where("entryId").equals(entryId).toArray();
  }
  putCards(cards: Card[]) {
    return this.db.cards.bulkPut(cards).then(() => undefined);
  }
  deleteCards(ids: string[]) {
    return this.db.cards.bulkDelete(ids);
  }
  addLogs(logs: ReviewLog[]) {
    return this.db.reviewLogs.bulkPut(logs).then(() => undefined);
  }
  deleteLogs(ids: string[]) {
    return this.db.reviewLogs.bulkDelete(ids);
  }
  getLog(id: string) {
    return this.db.reviewLogs.get(id);
  }
  logsSince(iso: string) {
    return this.db.reviewLogs.where("reviewedAt").aboveOrEqual(iso).toArray();
  }
  allLogs() {
    return this.db.reviewLogs.toArray();
  }

  putSource(source: Source) {
    return this.db.sources.put(source).then(() => undefined);
  }
  getSource(id: string) {
    return this.db.sources.get(id);
  }
  putBatch(batch: ImportBatch) {
    return this.db.importBatches.put(batch).then(() => undefined);
  }
  async listBatches() {
    const rows = await this.db.importBatches.toArray();
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return rows;
  }
  getBatch(id: string) {
    return this.db.importBatches.get(id);
  }
  putSuggestions(suggestions: Suggestion[]) {
    return this.db.suggestions.bulkPut(suggestions).then(() => undefined);
  }
  suggestionsForBatch(batchId: string) {
    return this.db.suggestions.where("batchId").equals(batchId).toArray();
  }
  async countOpenSuggestions() {
    return this.db.suggestions.filter((s) => !s.decision).count();
  }
  async deleteBatch(batchId: string) {
    await this.db.transaction("rw", this.db.importBatches, this.db.suggestions, async () => {
      await this.db.suggestions.where("batchId").equals(batchId).delete();
      await this.db.importBatches.delete(batchId);
    });
  }

  async ignoreKeys() {
    const rows = await this.db.ignoreList.toArray();
    return new Set(rows.map((r) => r.key));
  }
  addIgnore(entries: IgnoreEntry[]) {
    return this.db.ignoreList.bulkPut(entries).then(() => undefined);
  }
  removeIgnore(key: string) {
    return this.db.ignoreList.delete(key);
  }
  async getTensePlan() {
    const rows = await this.db.tensePlan.toArray();
    rows.sort((a, b) => a.order - b.order);
    return rows;
  }
  putTensePlan(rows: TensePlanRow[]) {
    return this.db.tensePlan.bulkPut(rows).then(() => undefined);
  }

  async exportAll() {
    const out: Record<string, unknown[]> = {};
    for (const name of EXPORT_TABLES) out[name] = await this.table(name).toArray();
    return out;
  }

  async importAll(data: Record<string, unknown[]>, mode: "replace" | "merge") {
    const tables = EXPORT_TABLES.map((n) => this.db.table(n));
    await this.db.transaction("rw", tables, async () => {
      for (const name of EXPORT_TABLES) {
        const rows = (data[name] ?? []) as { [k: string]: unknown; updatedAt?: string }[];
        const table = this.table(name);
        if (mode === "replace") {
          await table.clear();
          await table.bulkPut(rows);
          continue;
        }
        const keyPath = (table.schema.primKey.keyPath as string) ?? "id";
        for (const row of rows) {
          const key = row[keyPath] as string;
          const existing = (await table.get(key)) as { updatedAt?: string } | undefined;
          if (!existing || !existing.updatedAt || !row.updatedAt || row.updatedAt >= existing.updatedAt) {
            await table.put(row);
          }
        }
      }
    });
  }

  async clearAll() {
    const tables = [...EXPORT_TABLES.map((n) => this.db.table(n)), this.db.outbox];
    await this.db.transaction("rw", tables, async () => {
      for (const t of tables) await t.clear();
    });
  }

  async isEmpty() {
    return (await this.db.entries.count()) === 0 && (await this.db.cards.count()) === 0;
  }

  outboxAfter(seq: number, limit = 5000) {
    return this.db.outbox.where("seq").above(seq).limit(limit).toArray();
  }
  async outboxMaxSeq() {
    const last = await this.db.outbox.orderBy("seq").last();
    return last?.seq ?? 0;
  }
  clearOutboxThrough(seq: number) {
    return this.db.outbox.where("seq").belowOrEqual(seq).delete().then(() => undefined);
  }
  async getRows(table: string, ids: string[]) {
    if (!(EXPORT_TABLES as readonly string[]).includes(table)) return [];
    const rows = await this.table(table as ExportTable).bulkGet(ids);
    return rows.filter((r): r is { [k: string]: unknown } => !!r);
  }
  async deleteRows(table: string, ids: string[]) {
    if (!(EXPORT_TABLES as readonly string[]).includes(table)) return;
    await this.table(table as ExportTable).bulkDelete(ids);
  }
}

let repo: Repository | undefined;
export function getRepository(): Repository {
  if (!repo) repo = new DexieRepository();
  return repo;
}
