import { describe, expect, it } from "vitest";
import { interpretAnswer, runVoiceCard, type VoiceDeps } from "./voiceLoop";
import type { InputHandlers } from "@/input/InputSource";

describe("interpretAnswer", () => {
  it("maps sí / no / otra vez, accent-insensitively", () => {
    expect(interpretAnswer("sí")).toBe("good");
    expect(interpretAnswer("Si.")).toBe("good");
    expect(interpretAnswer("yes")).toBe("good");
    expect(interpretAnswer("no")).toBe("again");
    expect(interpretAnswer("no sé")).toBe("again");
    expect(interpretAnswer("otra vez")).toBe("repeat");
    expect(interpretAnswer("repite por favor")).toBe("repeat");
    expect(interpretAnswer("")).toBe("none");
    expect(interpretAnswer("mañana")).toBe("none");
  });
});

function fakes(answers: string[]) {
  const spoken: string[] = [];
  const cues: string[] = [];
  const deps: VoiceDeps = {
    speak: async (t) => void spoken.push(t),
    cancelSpeech: () => undefined,
    listen: async () => answers.shift() ?? "",
    wait: async () => undefined,
    cue: async (c) => void cues.push(c),
  };
  const calls: string[] = [];
  let flipped = false;
  const h: InputHandlers = {
    flip: () => {
      flipped = true;
      calls.push("flip");
    },
    grade: (g, mode) => calls.push(`grade:${g}:${mode}`),
    repeatAudio: () => calls.push("repeat"),
    skip: () => calls.push("skip"),
    isFlipped: () => flipped,
  };
  return { deps, h, spoken, calls, cues };
}

const card = { front: "house", back: ["casa", "Mi casa es grande."] };
const settings = { pauseSeconds: 0, listenSeconds: 1 };

describe("runVoiceCard", () => {
  it("speaks front, flips, speaks back, grades on sí", async () => {
    const f = fakes(["sí"]);
    const r = await runVoiceCard(f.deps, f.h, card, settings, new AbortController().signal);
    expect(r).toBe("graded");
    expect(f.spoken).toEqual(["house", "casa", "Mi casa es grande."]);
    expect(f.calls).toEqual(["flip", "grade:good:voice"]);
    expect(f.cues).toEqual(["listen", "good"]);
  });

  it("repeats on otra vez, then grades Again on no", async () => {
    const f = fakes(["otra vez", "no"]);
    await runVoiceCard(f.deps, f.h, card, settings, new AbortController().signal);
    expect(f.spoken.filter((t) => t === "casa").length).toBe(2);
    expect(f.calls.at(-1)).toBe("grade:again:voice");
  });

  it("repeats once on silence, then skips", async () => {
    const f = fakes(["", ""]);
    const r = await runVoiceCard(f.deps, f.h, card, settings, new AbortController().signal);
    expect(r).toBe("skipped");
    expect(f.spoken.filter((t) => t === "casa").length).toBe(2);
    expect(f.calls).toEqual(["flip", "skip"]);
    expect(f.cues).toEqual(["listen", "listen", "skip"]);
  });

  it("stops when cancelled", async () => {
    const ctrl = new AbortController();
    const f = fakes([]);
    f.deps.listen = async () => {
      ctrl.abort();
      return "sí";
    };
    const r = await runVoiceCard(f.deps, f.h, card, settings, ctrl.signal);
    expect(r).toBe("cancelled");
    expect(f.calls).toEqual(["flip"]);
  });
});
