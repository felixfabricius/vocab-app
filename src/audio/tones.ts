/**
 * Short synthesized cues for voice review (no audio files). Web Audio works in
 * WKWebView and routes through the app's audio session.
 */
export type Cue = "listen" | "good" | "again" | "repeat" | "skip";

let ctx: AudioContext | undefined;

function context(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Note {
  freq: number;
  /** seconds */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const CUES: Record<Cue, Note[]> = {
  listen: [{ freq: 1200, at: 0, dur: 0.06, gain: 0.15 }],
  good: [
    { freq: 880, at: 0, dur: 0.1 },
    { freq: 1320, at: 0.11, dur: 0.16 },
  ],
  again: [
    { freq: 330, at: 0, dur: 0.14, type: "triangle" },
    { freq: 220, at: 0.15, dur: 0.22, type: "triangle" },
  ],
  repeat: [
    { freq: 660, at: 0, dur: 0.08 },
    { freq: 660, at: 0.12, dur: 0.08 },
  ],
  skip: [
    { freq: 440, at: 0, dur: 0.12, type: "triangle" },
    { freq: 440, at: 0.2, dur: 0.12, type: "triangle" },
  ],
};

/** Plays the cue; resolves when it has finished (so recognition does not hear it). */
export function playCue(cue: Cue): Promise<void> {
  const ac = context();
  const notes = CUES[cue];
  if (!ac || notes.length === 0) return Promise.resolve();
  const start = ac.currentTime + 0.01;
  let end = start;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    const t0 = start + n.at;
    const t1 = t0 + n.dur;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(n.gain ?? 0.25, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
    end = Math.max(end, t1);
  }
  return new Promise((r) => setTimeout(r, Math.ceil((end - ac.currentTime) * 1000) + 30));
}
