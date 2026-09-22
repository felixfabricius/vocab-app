/**
 * EXT: storage — the app talks to storage only through this interface.
 * Phase 1 implements it with Dexie (IndexedDB); a native build may use SQLite.
 */
import type {
  Card,
  Encounter,
  Entry,
  IgnoreEntry,
  ImportBatch,
  Lookup,
  ReviewLog,
  Sense,
  Sentence,
  Settings,
  Source,
  Suggestion,
  TensePlanRow,
} from "@/core/types";

export interface EntryBundle {
  entry: Entry;
  senses: Sense[];
  cards: Card[];
  encounters: Encounter[];
  sentences: Sentence[];
}

export interface Repository {
  // settings
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;

  // entries and related
  getEntry(id: string): Promise<Entry | undefined>;
  findEntry(lemma: string, pos: string): Promise<Entry | undefined>;
  listEntries(filter?: { status?: Entry["status"]; search?: string; tag?: string; limit?: number }): Promise<Entry[]>;
  allActiveEntriesById(): Promise<Map<string, Entry>>;
  /** Tags on active entries with how many entries carry each, most used first. */
  allTags(): Promise<{ tag: string; count: number }[]>;
  getBundle(entryId: string): Promise<EntryBundle | undefined>;
  putEntry(entry: Entry): Promise<void>;
  putEntries(entries: Entry[]): Promise<void>;
  putSenses(senses: Sense[]): Promise<void>;
  deleteSense(id: string): Promise<void>;
  putSentences(sentences: Sentence[]): Promise<void>;
  putEncounters(encounters: Encounter[]): Promise<void>;
  sentencesForEntry(entryId: string): Promise<{ sentence: Sentence; encounter: Encounter }[]>;
  /** Active entry ids that have no sentence at all (candidates for enrichment). */
  entryIdsWithoutSentences(): Promise<string[]>;
  trashEntry(entryId: string, at: string): Promise<void>;
  restoreEntry(entryId: string, at: string): Promise<void>;
  purgeTrashedBefore(iso: string): Promise<number>;

  // cards and reviews
  allCards(): Promise<Card[]>;
  cardsForEntry(entryId: string): Promise<Card[]>;
  putCards(cards: Card[]): Promise<void>;
  deleteCards(ids: string[]): Promise<void>;
  addLogs(logs: ReviewLog[]): Promise<void>;
  deleteLogs(ids: string[]): Promise<void>;
  getLog(id: string): Promise<ReviewLog | undefined>;
  logsSince(iso: string): Promise<ReviewLog[]>;
  allLogs(): Promise<ReviewLog[]>;

  // sources, batches, suggestions
  putSource(source: Source): Promise<void>;
  getSource(id: string): Promise<Source | undefined>;
  putBatch(batch: ImportBatch): Promise<void>;
  listBatches(): Promise<ImportBatch[]>;
  getBatch(id: string): Promise<ImportBatch | undefined>;
  putSuggestions(suggestions: Suggestion[]): Promise<void>;
  suggestionsForBatch(batchId: string): Promise<Suggestion[]>;
  countOpenSuggestions(): Promise<number>;
  deleteBatch(batchId: string): Promise<void>;

  // ignore list and tense plan
  ignoreKeys(): Promise<Set<string>>;
  addIgnore(entries: IgnoreEntry[]): Promise<void>;
  removeIgnore(key: string): Promise<void>;
  getTensePlan(): Promise<TensePlanRow[]>;
  putTensePlan(rows: TensePlanRow[]): Promise<void>;

  // translate lookups
  putLookups(rows: Lookup[]): Promise<void>;
  listLookups(filter?: { unconsumed?: boolean; limit?: number }): Promise<Lookup[]>;
  countUnconsumedLookups(): Promise<number>;
  markLookupsConsumed(ids: string[], batchId: string, at: string): Promise<void>;

  // whole-database operations
  exportAll(): Promise<Record<string, unknown[]>>;
  importAll(data: Record<string, unknown[]>, mode: "replace" | "merge"): Promise<void>;
  clearAll(): Promise<void>;
}
