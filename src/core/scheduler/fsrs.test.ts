import { describe, expect, it } from "vitest";
import { gradeState, makeScheduler, newFsrsState, rollbackState, retrievability } from "./fsrs";

const now = new Date("2026-09-18T10:00:00Z");

/** Grade Good until the card leaves the learning steps (Again/Good only, so this is how cards reach review). */
function graduate(sch: ReturnType<typeof makeScheduler>) {
  let state = newFsrsState(now);
  let next = now;
  let at = now;
  let log = gradeState(sch, state, "good", at).log;
  for (let i = 0; i < 10 && state.state !== 2; i++) {
    at = next;
    const r = gradeState(sch, state, "good", at);
    state = r.state;
    log = r.log;
    next = new Date(state.due);
  }
  /** `at` is when the last (graduating) grade was given */
  return { state, log, at };
}

describe("fsrs wrapper", () => {
  it("creates a new card due now", () => {
    const s = newFsrsState(now);
    expect(s.state).toBe(0);
    expect(s.reps).toBe(0);
    expect(new Date(s.due).getTime()).toBe(now.getTime());
  });

  it("Good on a new card enters learning with a short interval", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const r = gradeState(sch, newFsrsState(now), "good", now);
    expect(r.state.reps).toBe(1);
    expect(r.state.state).toBe(1); // Learning (short-term steps enabled)
    const minutes = (new Date(r.state.due).getTime() - now.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(0);
    expect(minutes).toBeLessThan(60);
    expect(r.log.rating).toBe(3);
  });

  it("Good through the learning steps graduates to review with days ahead", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const r = graduate(sch);
    const days = (new Date(r.state.due).getTime() - r.at.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(1);
    expect(r.state.state).toBe(2);
  });

  it("higher retention target gives shorter intervals", () => {
    const lo = makeScheduler({ requestRetention: 0.85, enableFuzz: false });
    const hi = makeScheduler({ requestRetention: 0.95, enableFuzz: false });
    const a = graduate(lo);
    const b = graduate(hi);
    expect(a.state.scheduledDays).toBeGreaterThan(b.state.scheduledDays);
  });

  it("Again after a review increments lapses and rollback restores", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const first = graduate(sch);
    const later = new Date(first.state.due);
    const second = gradeState(sch, first.state, "again", later);
    expect(second.state.lapses).toBe(1);
    const back = rollbackState(sch, second.state, second.log);
    expect(back.lapses).toBe(first.state.lapses);
    expect(back.stability).toBeCloseTo(first.state.stability, 6);
  });

  it("retrievability decays over time", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const r = graduate(sch);
    const soon = retrievability(sch, r.state, new Date(r.at.getTime() + 3600_000));
    const late = retrievability(sch, r.state, new Date(r.at.getTime() + 30 * 86_400_000));
    expect(soon).toBeGreaterThan(late);
  });
});
