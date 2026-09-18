import { describe, expect, it } from "vitest";
import { createReviewState, flip, grade, remaining, repeat, start, undo, type ReviewEnv } from "./session";
import { makeScheduler, newFsrsState } from "@/core/scheduler/fsrs";
import type { Card, ReviewLog } from "@/core/types";

let clock = new Date("2026-09-18T10:00:00Z").getTime();
let ids = 0;
const scheduler = makeScheduler({ requestRetention: 0.9, enableFuzz: false });

const env: ReviewEnv = {
  now: () => new Date(clock),
  newId: () => `id${++ids}`,
  schedulerFor: () => scheduler,
  priorityOf: () => "core",
  leechThresholdOf: () => 8,
  rolloverHour: 4,
  mode: "tap",
};

function card(id: string): Card {
  const now = new Date(clock);
  return {
    id,
    entryId: `e-${id}`,
    type: "production",
    fsrs: newFsrsState(now),
    status: "active",
    flagged: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

describe("review session", () => {
  it("walks the queue, keeps learning cards in the session, and finishes", () => {
    const logs = new Map<string, ReviewLog>();
    let s = start(createReviewState([card("a"), card("b")], []), env);
    expect(s.current?.id).toBe("a");
    expect(remaining(s)).toBe(2);

    s = flip(s);
    let r = grade(s, "good", env);
    s = r.state;
    for (const l of r.effects.addLogs ?? []) logs.set(l.id, l);
    // "a" graded Good on a new card -> learning step, comes back later in the session
    expect(s.learning.map((c) => c.id)).toEqual(["a"]);
    expect(s.current?.id).toBe("b");

    r = grade(flip(s), "easy", env);
    s = r.state;
    // queue empty, "a" not due yet but shown ahead rather than ending
    expect(s.current?.id).toBe("a");
    expect(s.finished).toBe(false);

    clock += 15 * 60_000;
    r = grade(flip(s), "good", env);
    s = r.state;
    expect(s.graded).toBe(3);
    // may still be in learning (second step) or finished; drain
    while (!s.finished) {
      clock += 15 * 60_000;
      r = grade(flip(s), "good", env);
      s = r.state;
    }
    expect(s.current).toBeUndefined();
  });

  it("undo restores the previous card state and removes the log", () => {
    const logs = new Map<string, ReviewLog>();
    let s = start(createReviewState([card("a"), card("b")], []), env);
    const before = s.current!;
    const r = grade(flip(s), "good", env);
    s = r.state;
    for (const l of r.effects.addLogs ?? []) logs.set(l.id, l);
    const logId = r.effects.addLogs![0]!.id;

    const u = undo(s, env, (id) => logs.get(id));
    expect(u.effects.deleteLogIds).toEqual([logId]);
    expect(u.state.current?.id).toBe("a");
    expect(u.state.current?.fsrs.reps).toBe(before.fsrs.reps);
    expect(u.state.current?.fsrs.state).toBe(0);
    expect(u.state.queue.map((c) => c.id)).toEqual(["b"]);
    expect(u.state.learning).toEqual([]);
    expect(u.state.graded).toBe(0);
  });

  it("repeat pushes the card back a few positions without grading", () => {
    let s = start(createReviewState([card("a"), card("b"), card("c")], []), env);
    s = repeat(s, env);
    expect(s.current?.id).toBe("b");
    expect(s.queue.map((c) => c.id)).toEqual(["c", "a"]);
    expect(s.graded).toBe(0);
  });

  it("suspends and flags a card that reaches the leech threshold", () => {
    const leechEnv: ReviewEnv = { ...env, leechThresholdOf: () => 1 };
    let s = start(createReviewState([card("a")], []), leechEnv);
    let r = grade(flip(s), "easy", leechEnv);
    s = r.state;
    // bring it back as due and fail it
    clock += 30 * 86_400_000;
    const reviewed = r.effects.upsertCards![0]!;
    s = start(createReviewState([reviewed], []), leechEnv);
    r = grade(flip(s), "again", leechEnv);
    const after = r.effects.upsertCards![0]!;
    expect(after.fsrs.lapses).toBe(1);
    expect(after.status).toBe("suspended");
    expect(after.flagged).toBe(true);
    expect(r.state.learning).toEqual([]);
  });
});
