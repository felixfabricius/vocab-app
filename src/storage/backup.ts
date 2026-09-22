import type { Repository } from "./Repository";

/** 1 = web phase; 2 adds the `lookups` table (older files import fine: missing tables are skipped). */
export const BACKUP_VERSION = 2;

export interface BackupFile {
  app: "vocab";
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(repo: Repository): Promise<BackupFile> {
  return { app: "vocab", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: await repo.exportAll() };
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text) as Partial<BackupFile>;
  if (data.app !== "vocab" || typeof data.version !== "number" || !data.tables) {
    throw new Error("Not a vocab backup file");
  }
  if (data.version > BACKUP_VERSION) throw new Error(`Backup version ${data.version} is newer than this app`);
  return data as BackupFile;
}

export async function importBackup(repo: Repository, file: BackupFile, mode: "replace" | "merge"): Promise<void> {
  await repo.importAll(file.tables, mode);
}

/** Save a backup: share sheet on iOS (lets you pick Files), download elsewhere. */
export async function saveBackupFile(backup: BackupFile): Promise<"shared" | "downloaded"> {
  const name = `vocab-backup-${backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = new File([blob], name, { type: "application/json" });
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: name });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
