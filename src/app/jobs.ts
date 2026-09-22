/**
 * Long-running jobs (Claude enrichment, lookup imports) with progress and
 * cancel. Module-level so a job survives navigation; screens subscribe with
 * `useJob` and the drafts table shows the bar for its batch.
 */
import { useEffect, useState } from "react";

export interface JobState {
  id: string;
  label: string;
  batchId?: string;
  done: number;
  total: number;
  /** set when the job finished, failed or was cancelled */
  status: "running" | "done" | "failed" | "cancelled";
  message?: string;
}

export interface JobHandle<T> {
  id: string;
  result: Promise<T | undefined>;
  cancel(): void;
}

export type ProgressFn = (done: number, total: number) => void;

let jobs: JobState[] = [];
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

function update(id: string, patch: Partial<JobState>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  emit();
}

export function runJob<T>(opts: {
  label: string;
  batchId?: string;
  task: (signal: AbortSignal, progress: ProgressFn) => Promise<T>;
  /** called with the result to build the finishing message */
  summary?: (result: T) => string;
}): JobHandle<T> {
  const id = `job${++seq}`;
  const controller = new AbortController();
  controllers.set(id, controller);
  jobs = [...jobs.filter((j) => j.status === "running"), { id, label: opts.label, ...(opts.batchId ? { batchId: opts.batchId } : {}), done: 0, total: 0, status: "running" }];
  emit();
  const result = opts
    .task(controller.signal, (done, total) => update(id, { done, total }))
    .then((r) => {
      update(id, { status: controller.signal.aborted ? "cancelled" : "done", ...(opts.summary ? { message: opts.summary(r) } : {}) });
      return r as T | undefined;
    })
    .catch((e: unknown) => {
      update(id, { status: controller.signal.aborted ? "cancelled" : "failed", message: (e as Error).message });
      return undefined;
    })
    .finally(() => {
      controllers.delete(id);
      // Keep finished jobs visible for a while so the table can show the outcome.
      setTimeout(() => {
        jobs = jobs.filter((j) => j.id !== id);
        emit();
      }, 8000);
    });
  return { id, result, cancel: () => controller.abort() };
}

export function cancelJob(id: string) {
  controllers.get(id)?.abort();
}

export function currentJobs(): JobState[] {
  return jobs;
}

/** The newest job for a batch (or the newest of all when no batch id is given). */
export function useJob(batchId?: string): JobState | undefined {
  const pick = () => {
    const list = batchId ? jobs.filter((j) => j.batchId === batchId) : jobs;
    return list[list.length - 1];
  };
  const [job, setJob] = useState<JobState | undefined>(pick);
  useEffect(() => {
    const l = () => setJob(pick());
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);
  return job;
}
