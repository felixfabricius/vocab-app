import { describe, expect, it } from "vitest";
import { dayEnd, dayKey, dayStart } from "./day";

describe("day boundaries with 04:00 rollover", () => {
  it("counts 01:30 as the previous calendar day", () => {
    const d = new Date(2026, 8, 18, 1, 30); // local 2026-09-18 01:30
    expect(dayKey(d, 4)).toBe("2026-09-17");
  });

  it("counts 04:00 as the new day", () => {
    const d = new Date(2026, 8, 18, 4, 0);
    expect(dayKey(d, 4)).toBe("2026-09-18");
  });

  it("dayStart/dayEnd bracket the learning day", () => {
    const d = new Date(2026, 8, 18, 23, 0);
    expect(dayStart(d, 4).getTime()).toBe(new Date(2026, 8, 18, 4, 0).getTime());
    expect(dayEnd(d, 4).getTime()).toBe(new Date(2026, 8, 19, 4, 0).getTime());
  });

  it("rollover 0 behaves like calendar days", () => {
    const d = new Date(2026, 8, 18, 0, 5);
    expect(dayKey(d, 0)).toBe("2026-09-18");
  });
});
