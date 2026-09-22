/**
 * iCloud Drive container storage (SPEC-NATIVE §7): `snapshot.json` (a full
 * backup) plus `changes/*.jsonl` drained from the outbox. On launch, a fresh
 * install restores from the snapshot; an existing install merges a newer one.
 * Single device is the normal case; the change log keeps the door open.
 *
 * Change files carry `{ table, rowId, op, at, row? }` per line. The settings
 * row is excluded (it changes on every sync and every Claude call; the
 * snapshot carries it).
 */
import { BACKUP_VERSION, parseBackup, type BackupFile } from "./backup";
import type { Repository } from "./Repository";
import type { CloudFiles } from "@/native/cloudFiles";
import type { CloudState, OutboxRow } from "@/core/types";

export const SNAPSHOT_PATH = "snapshot.json";
export const CHANGES_DIR = "changes";
const SNAPSHOT_MAX_AGE_MS = 24 * 3600_000;
const MAX_CHANGE_FILES = 200;

export interface ChangeLine {
  table: string;
  rowId: string;
  op: "upsert" | "delete";
  at: string;
  row?: unknown;
}

export interface CloudStatus {
  available: boolean;
  lastSnapshotAt?: string;
  cloudSnapshotAt?: string;
  changeFiles: number;
  pendingRows: number;
}

function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

/** ISO timestamp encoded in a change-file name, comparable with `fileStamp(exportedAt)`. */
function stampOf(name: string): string {
  return name.split("_")[0] ?? "";
}

export class CloudSync {
  constructor(
    private readonly repo: Repository,
    private readonly files: CloudFiles,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async state(): Promise<CloudState> {
    const s = await this.repo.getSettings();
    return s.cloud ?? { lastSeq: 0, snapshotDirty: false };
  }

  private async saveState(patch: Partial<CloudState>) {
    const cur = await this.state();
    await this.repo.saveSettings({ cloud: { ...cur, ...patch } });
  }

  /** Persist the state and clear the outbox through `seq`, including the settings row this very save produced. */
  private async commit(seq: number, patch: Partial<CloudState>) {
    await this.saveState({ ...patch, lastSeq: seq });
    await this.repo.clearOutboxThrough(seq);
    const tail = await this.repo.outboxAfter(seq);
    if (tail.length > 0 && tail.every((r) => r.table === "settings")) {
      const last = tail[tail.length - 1]!.seq ?? seq;
      await this.repo.clearOutboxThrough(last);
      await this.saveState({ lastSeq: last });
      // that save added one more settings row; it is harmless and goes with the next drain
    }
  }

  /** Outbox rows since the last drain → one change file. Returns the number of rows written. */
  async drainOutbox(): Promise<number> {
    if (!(await this.files.available())) return 0;
    const st = await this.state();
    const rows = await this.repo.outboxAfter(st.lastSeq);
    if (rows.length === 0) return 0;
    const maxSeq = rows[rows.length - 1]!.seq ?? st.lastSeq;
    let dirty = st.snapshotDirty;
    const lines = await this.linesFor(rows, () => (dirty = true));
    if (lines.length > 0) {
      const first = rows[0]!.seq ?? 0;
      const name = `${fileStamp(this.now().toISOString())}_${first}-${maxSeq}.jsonl`;
      await this.files.write(`${CHANGES_DIR}/${name}`, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    }
    await this.commit(maxSeq, { snapshotDirty: dirty });
    return lines.length;
  }

  private async linesFor(rows: OutboxRow[], markDirty: () => void): Promise<ChangeLine[]> {
    // Last write per (table,row) wins; deleteRange rows mean the log cannot express it.
    const latest = new Map<string, OutboxRow>();
    for (const r of rows) {
      if (r.table === "settings") continue;
      if (r.rowId === "*") {
        markDirty();
        continue;
      }
      latest.set(`${r.table}|${r.rowId}`, r);
    }
    const byTable = new Map<string, OutboxRow[]>();
    for (const r of latest.values()) {
      const list = byTable.get(r.table) ?? [];
      list.push(r);
      byTable.set(r.table, list);
    }
    const out: ChangeLine[] = [];
    for (const [table, list] of byTable) {
      const upserts = list.filter((r) => r.op === "upsert");
      const rowsById = new Map<string, unknown>();
      if (upserts.length > 0) {
        const fetched = (await this.repo.getRows(table, upserts.map((r) => r.rowId))) as { [k: string]: unknown }[];
        for (const row of fetched) rowsById.set(String(row.id ?? row.key ?? row.tense), row);
      }
      for (const r of list) {
        if (r.op === "delete") out.push({ table, rowId: r.rowId, op: "delete", at: r.at });
        else {
          const row = rowsById.get(r.rowId);
          // Upserted then deleted before the drain: nothing to write.
          if (row !== undefined) out.push({ table, rowId: r.rowId, op: "upsert", at: r.at, row });
        }
      }
    }
    return out;
  }

  /** Full export to `snapshot.json`; prunes change files older than it. */
  async writeSnapshot(): Promise<BackupFile | undefined> {
    if (!(await this.files.available())) return undefined;
    await this.drainOutbox();
    const backup: BackupFile = { app: "vocab", version: BACKUP_VERSION, exportedAt: this.now().toISOString(), tables: await this.repo.exportAll() };
    await this.files.write(SNAPSHOT_PATH, JSON.stringify(backup));
    await this.commit(await this.repo.outboxMaxSeq(), { lastSnapshotAt: backup.exportedAt, snapshotDirty: false });
    // Change files up to the snapshot's own stamp are contained in it.
    const stamp = fileStamp(backup.exportedAt);
    for (const f of await this.listChanges()) {
      if (stampOf(f) <= stamp) await this.files.delete(`${CHANGES_DIR}/${f}`);
    }
    return backup;
  }

  /** Called when the app goes to the background: drain, and snapshot when due. */
  async onBackground(): Promise<"drained" | "snapshot" | "none"> {
    if (!(await this.files.available())) return "none";
    const drained = await this.drainOutbox();
    const st = await this.state();
    const age = st.lastSnapshotAt ? this.now().getTime() - new Date(st.lastSnapshotAt).getTime() : Number.POSITIVE_INFINITY;
    const files = (await this.listChanges()).length;
    if (st.snapshotDirty || age > SNAPSHOT_MAX_AGE_MS || files > MAX_CHANGE_FILES) {
      await this.writeSnapshot();
      return "snapshot";
    }
    return drained > 0 ? "drained" : "none";
  }

  /**
   * On launch, before the seed. Empty local database + cloud snapshot → replace
   * (new phone). Non-empty database + a snapshot newer than the one this device
   * knows → merge. Otherwise nothing.
   */
  async restoreIfNeeded(): Promise<"restored" | "merged" | "none"> {
    if (!(await this.files.available())) return "none";
    const text = await this.files.read(SNAPSHOT_PATH);
    if (!text) return "none";
    const snapshot = parseBackup(text);
    const st = await this.state();
    const empty = await this.repo.isEmpty();
    if (!empty && st.lastSnapshotAt && snapshot.exportedAt <= st.lastSnapshotAt) return "none";
    // A device with data that never synced merges: both sides kept, newer rows win.
    await this.repo.importAll(snapshot.tables, empty ? "replace" : "merge");
    await this.applyChangesAfter(snapshot.exportedAt);
    await this.commit(await this.repo.outboxMaxSeq(), { lastSnapshotAt: snapshot.exportedAt, snapshotDirty: false });
    return empty ? "restored" : "merged";
  }

  /** Apply change files whose stamp is newer than the given snapshot time, in name order. */
  async applyChangesAfter(exportedAt: string): Promise<number> {
    const stamp = fileStamp(exportedAt);
    const names = (await this.listChanges()).filter((n) => stampOf(n) > stamp).sort();
    let applied = 0;
    for (const name of names) {
      const text = await this.files.read(`${CHANGES_DIR}/${name}`);
      if (!text) continue;
      const upserts = new Map<string, unknown[]>();
      const deletes = new Map<string, string[]>();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const c = JSON.parse(line) as ChangeLine;
        if (c.op === "upsert" && c.row !== undefined) (upserts.get(c.table) ?? upserts.set(c.table, []).get(c.table)!).push(c.row);
        else if (c.op === "delete") (deletes.get(c.table) ?? deletes.set(c.table, []).get(c.table)!).push(c.rowId);
        applied++;
      }
      if (upserts.size > 0) await this.repo.importAll(Object.fromEntries(upserts), "merge");
      for (const [table, ids] of deletes) await this.repo.deleteRows(table, ids);
    }
    return applied;
  }

  async listChanges(): Promise<string[]> {
    try {
      return (await this.files.list(CHANGES_DIR)).map((e) => e.name).filter((n) => n.endsWith(".jsonl"));
    } catch {
      return [];
    }
  }

  async status(): Promise<CloudStatus> {
    const available = await this.files.available();
    const st = await this.state();
    const pendingRows = available ? (await this.repo.outboxAfter(st.lastSeq)).length : 0;
    let cloudSnapshotAt: string | undefined;
    if (available) {
      try {
        const text = await this.files.read(SNAPSHOT_PATH);
        if (text) cloudSnapshotAt = parseBackup(text).exportedAt;
      } catch {
        cloudSnapshotAt = undefined;
      }
    }
    return {
      available,
      ...(st.lastSnapshotAt ? { lastSnapshotAt: st.lastSnapshotAt } : {}),
      ...(cloudSnapshotAt ? { cloudSnapshotAt } : {}),
      changeFiles: available ? (await this.listChanges()).length : 0,
      pendingRows,
    };
  }
}

/** In-memory CloudFiles for tests and for the web build (where iCloud does not exist). */
export class MemoryCloudFiles implements CloudFiles {
  files = new Map<string, string>();
  constructor(private readonly isAvailable = true) {}
  async available() {
    return this.isAvailable;
  }
  async read(path: string) {
    return this.files.get(path);
  }
  async write(path: string, text: string) {
    this.files.set(path, text);
  }
  async list(dir: string) {
    const prefix = dir ? `${dir}/` : "";
    return [...this.files.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
      .map((k) => ({ name: k.slice(prefix.length), modifiedAt: "", size: this.files.get(k)!.length, downloaded: true }));
  }
  async delete(path: string) {
    this.files.delete(path);
  }
}
