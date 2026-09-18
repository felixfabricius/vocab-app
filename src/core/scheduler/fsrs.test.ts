import { describe, expect, it } from "vitest";
import { gradeState, makeScheduler, newFsrsState, rollbackState, retrievability } from "./fsrs";

const now = new Date("2026-09-18T10:00:00Z");

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

  it("Easy on a new card schedules days ahead", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const r = gradeState(sch, newFsrsState(now), "easy", now);
    const days = (new Date(r.state.due).getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(1);
    expect(r.state.state).toBe(2);
  });

  it("higher retention target gives shorter intervals", () => {
    const lo = makeScheduler({ requestRetention: 0.85, enableFuzz: false });
    const hi = makeScheduler({ requestRetention: 0.95, enableFuzz: false });
    const a = gradeState(lo, newFsrsState(now), "easy", now);
    const b = gradeState(hi, newFsrsState(now), "easy", now);
    expect(a.state.scheduledDays).toBeGreaterThan(b.state.scheduledDays);
  });

  it("Again after a review increments lapses and rollback restores", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const first = gradeState(sch, newFsrsState(now), "easy", now);
    const later = new Date(first.state.due);
    const second = gradeState(sch, first.state, "again", later);
    expect(second.state.lapses).toBe(1);
    const back = rollbackState(sch, second.state, second.log);
    expect(back.lapses).toBe(first.state.lapses);
    expect(back.stability).toBeCloseTo(first.state.stability, 6);
  });

  it("retrievability decays over time", () => {
    const sch = makeScheduler({ requestRetention: 0.9, enableFuzz: false });
    const r = gradeState(sch, newFsrsState(now), "easy", now);
    const soon = retrievability(sch, r.state, new Date(now.getTime() + 3600_000));
    const late = retrievability(sch, r.state, new Date(now.getTime() + 30 * 86_400_000));
    expect(soon).toBeGreaterThan(late);
  });
});
