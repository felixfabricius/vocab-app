import { describe, expect, it } from "vitest";
import { priorityForPhrase, priorityFromRank } from "./rank";

describe("priorityFromRank", () => {
  it("maps ranks to classes with exclusive upper bounds", () => {
    expect(priorityFromRank(1)).toBe("essential");
    expect(priorityFromRank(499)).toBe("essential");
    expect(priorityFromRank(500)).toBe("core");
    expect(priorityFromRank(1999)).toBe("core");
    expect(priorityFromRank(2000)).toBe("standard");
    expect(priorityFromRank(9999)).toBe("standard");
    expect(priorityFromRank(10000)).toBe("niche");
    expect(priorityFromRank(undefined)).toBe("niche");
  });
});

describe("priorityForPhrase", () => {
  it("uses CEFR, bumps by usefulness, and caps at the rarest component", () => {
    expect(priorityForPhrase("A1", 3, undefined)).toBe("essential");
    expect(priorityForPhrase("A2", 5, undefined)).toBe("essential");
    expect(priorityForPhrase("A1", 1, undefined)).toBe("core");
    expect(priorityForPhrase("A1", 5, "standard")).toBe("standard");
    expect(priorityForPhrase(undefined, undefined, undefined)).toBe("standard");
    expect(priorityForPhrase("C1", 5, undefined)).toBe("niche");
  });
});
