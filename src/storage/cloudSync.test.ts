import { describe, expect, it } from "vitest";
import { CloudSync, MemoryCloudFiles, SNAPSHOT_PATH } from "./cloudSync";
import { DexieRepository } from "./DexieRepository";
import { VocabDB } from "./db";
import type { Entry } from "@/core/types";

let n = 0;
let clock = new Date("2026-09-22T10:00:00Z").getTime();
const now = () => new Date(clock);
const t = "2026-09-22T09:00:00.000Z";

function fresh() {
  const repo = new DexieRepository(new VocabDB(`cloud-${++n}`));
  return repo;
}

function entry(id: string, lemma: string, updatedAt = t): Entry {
  return { id, lang: "es", lemma, pos: "noun", isPhrase: false, priority: "core", priorityAuto: true, regional: "neutral", tags: [], status: "active", sourceIds: [], createdAt: t, updatedAt };
}

describe("cloud sync", () => {
  it("drains the outbox into a change file with row contents, then clears it", async () => {
    const repo = fresh();
    const files = new MemoryCloudFiles();
    const sync = new CloudSync(repo, files, now);
    await repo.putEntries([entry("e1", "casa"), entry("e2", "perro")]);
    await repo.saveSettings({ dailyNewLimit: 30 }); // settings rows are not logged
    await repo.trashEntry("e2", t);
    expect(await sync.drainOutbox()).toBe(2); // last write per row wins
    const names = await sync.listChanges();
    expect(names.length).toBe(1);
    const lines = (await files.read(`changes/${names[0]}`))!.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.map((l) => l.rowId).sort()).toEqual(["e1", "e2"]);
    expect(lines.find((l) => l.rowId === "e2").row.status).toBe("trashed");
    expect((await repo.outboxAfter(0)).filter((r) => r.table !== "settings")).toEqual([]);
    expect(await sync.drainOutbox()).toBe(0);
  });

  it("restores a fresh install from the snapshot and later change files", async () => {
    const source = fresh();
    const files = new MemoryCloudFiles();
    const a = new CloudSync(source, files, now);
    await source.putEntries([entry("e1", "casa")]);
    await a.writeSnapshot();
    clock += 60_000;
    await source.putEntries([entry("e2", "gato", now().toISOString())]);
    await source.deleteRows("entries", ["e1"]);
    await a.drainOutbox();
    expect(files.files.has(SNAPSHOT_PATH)).toBe(true);

    const target = fresh();
    const b = new CloudSync(target, files, now);
    expect(await b.restoreIfNeeded()).toBe("restored");
    expect((await target.getEntry("e2"))?.lemma).toBe("gato");
    expect(await target.getEntry("e1")).toBeUndefined();
    expect((await target.outboxAfter(0)).filter((r) => r.table !== "settings")).toEqual([]); // the import itself is not re-logged
    expect(await b.restoreIfNeeded()).toBe("none"); // nothing newer
  });

  it("merges a newer snapshot into an existing database, newer rows win", async () => {
    const files = new MemoryCloudFiles();
    const local = fresh();
    const sync = new CloudSync(local, files, now);
    await local.putEntries([entry("e1", "casa", "2026-09-22T09:00:00.000Z"), entry("e3", "sol")]);
    await sync.writeSnapshot();
    // another device writes a newer snapshot with an updated e1 and a new e2
    clock += 3600_000;
    const other = fresh();
    await other.putEntries([entry("e1", "casona", "2026-09-22T10:30:00.000Z"), entry("e2", "luna")]);
    await new CloudSync(other, files, now).writeSnapshot();
    clock += 60_000;
    expect(await sync.restoreIfNeeded()).toBe("merged");
    expect((await local.getEntry("e1"))?.lemma).toBe("casona");
    expect((await local.getEntry("e2"))?.lemma).toBe("luna");
    expect((await local.getEntry("e3"))?.lemma).toBe("sol");
  });

  it("marks a bulk delete as needing a snapshot and writes one on background", async () => {
    const repo = fresh();
    const files = new MemoryCloudFiles();
    const sync = new CloudSync(repo, files, now);
    await repo.putEntries([entry("e1", "casa")]);
    await sync.writeSnapshot();
    await repo.clearAll();
    await repo.putEntries([entry("e9", "nuevo")]);
    expect(await sync.onBackground()).toBe("snapshot");
    const snap = JSON.parse((await files.read(SNAPSHOT_PATH))!);
    expect(snap.tables.entries.map((e: Entry) => e.id)).toEqual(["e9"]);
    expect((await sync.status()).changeFiles).toBe(0);
  });

  it("does nothing when iCloud is unavailable", async () => {
    const repo = fresh();
    const sync = new CloudSync(repo, new MemoryCloudFiles(false), now);
    await repo.putEntries([entry("e1", "casa")]);
    expect(await sync.drainOutbox()).toBe(0);
    expect(await sync.restoreIfNeeded()).toBe("none");
    expect((await sync.status()).available).toBe(false);
  });
});
