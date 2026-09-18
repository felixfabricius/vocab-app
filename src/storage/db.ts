/**
 * Dexie database. Every mutation on a domain table is mirrored into `outbox`
 * by a DBCore middleware so a sync engine can replay changes later.
 *
 * EXT: storage — the native build may swap this for SQLite behind Repository.
 */
import Dexie, { type Table, type DBCore, type DBCoreMutateRequest, type Middleware } from "dexie";
import type {
  Card,
  Encounter,
  Entry,
  IgnoreEntry,
  ImportBatch,
  OutboxRow,
  ReviewLog,
  Sense,
  Sentence,
  Settings,
  Source,
  Suggestion,
  TensePlanRow,
} from "@/core/types";

export class VocabDB extends Dexie {
  entries!: Table<Entry, string>;
  senses!: Table<Sense, string>;
  sentences!: Table<Sentence, string>;
  encounters!: Table<Encounter, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;
  sources!: Table<Source, string>;
  importBatches!: Table<ImportBatch, string>;
  suggestions!: Table<Suggestion, string>;
  ignoreList!: Table<IgnoreEntry, string>;
  tensePlan!: Table<TensePlanRow, string>;
  settings!: Table<Settings, string>;
  outbox!: Table<OutboxRow, number>;

  constructor(name = "vocab") {
    super(name);
    this.version(1).stores({
      entries: "id, [lemma+pos], lemma, priority, status, updatedAt",
      senses: "id, entryId",
      sentences: "id, sourceId",
      encounters: "id, entryId, sentenceId",
      cards: "id, entryId, status, fsrs.due, [status+fsrs.due], [entryId+type+tense], flagged",
      reviewLogs: "id, cardId, reviewedAt",
      sources: "id, type, createdAt",
      importBatches: "id, sourceId, createdAt",
      suggestions: "id, batchId, decision",
      ignoreList: "key",
      tensePlan: "tense, order",
      settings: "id",
      outbox: "++seq, table, at",
    });
    this.use(outboxMiddleware);
  }
}

const TRACKED = new Set([
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
]);

const outboxMiddleware: Middleware<DBCore> = {
  stack: "dbcore",
  name: "outbox",
  create(core) {
    return {
      ...core,
      // Every read-write transaction also covers the outbox so the mirror write
      // below stays inside the same transaction (implicit ones included).
      transaction(stores, mode, options) {
        const widened = mode === "readwrite" && !stores.includes("outbox") ? [...stores, "outbox"] : stores;
        return core.transaction(widened, mode, options);
      },
      table(name) {
        const table = core.table(name);
        if (!TRACKED.has(name)) return table;
        return {
          ...table,
          async mutate(req: DBCoreMutateRequest) {
            const res = await table.mutate(req);
            const at = new Date().toISOString();
            const rows: OutboxRow[] = [];
            if (req.type === "add" || req.type === "put") {
              const keys = (res.results ?? req.keys ?? []) as unknown[];
              for (const k of keys) rows.push({ table: name, rowId: String(k), op: "upsert", at });
            } else if (req.type === "delete") {
              for (const k of req.keys as unknown[]) rows.push({ table: name, rowId: String(k), op: "delete", at });
            } else if (req.type === "deleteRange") {
              rows.push({ table: name, rowId: "*", op: "delete", at });
            }
            if (rows.length > 0) {
              const outbox = core.table("outbox");
              await outbox.mutate({ type: "add", trans: req.trans, values: rows });
            }
            return res;
          },
        };
      },
    };
  },
};

let instance: VocabDB | undefined;
export function getDb(): VocabDB {
  if (!instance) instance = new VocabDB();
  return instance;
}
