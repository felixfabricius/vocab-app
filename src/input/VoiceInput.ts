/**
 * Voice review level 1 bound to the native player and recogniser. The review
 * screen calls `startCard` when a card's content is ready and `cancel` when
 * the card changes, a touch grade happens, or the screen unmounts. Level 2
 * (screen locked) would keep this object and add a keep-alive audio session.
 */
import type { AudioPlayer } from "@/audio/AudioPlayer";
import { configureAudioSession, deactivateAudioSession } from "@/native/audioSession";
import type { LiveTranscriber } from "@/speech/LiveTranscriber";
import type { InputHandlers } from "./InputSource";
import { CONTEXTUAL_STRINGS, runVoiceCard, type VoiceCard, type VoiceDeps, type VoiceSettings, type VoiceStatus } from "@/features/review/voiceLoop";

export class VoiceInput {
  private controller: AbortController | undefined;
  private status: ((st: VoiceStatus) => void) | undefined;

  constructor(
    private readonly audio: AudioPlayer,
    private readonly transcriber: LiveTranscriber,
    private readonly rate: () => number,
  ) {}

  private deps(): VoiceDeps {
    return {
      speak: (text, lang) => this.audio.speak(text, { rate: this.rate(), ...(lang ? { lang } : {}) }),
      cancelSpeech: () => this.audio.cancel(),
      listen: (seconds) =>
        new Promise<string>((resolve) => {
          this.transcriber
            .start("es", { contextualStrings: CONTEXTUAL_STRINGS, maxSeconds: seconds, silenceSeconds: 1.2, taskHint: "confirmation" }, () => undefined, (text) => resolve(text))
            .catch((e: Error) => {
              // Not a silence: surface it, and never fake-listen (that would loop through repeats instantly).
              this.status?.({ phase: "error", message: e.message });
              this.controller?.abort();
              resolve("");
            });
        }),
      wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    };
  }

  async startCard(card: VoiceCard, handlers: InputHandlers, settings: VoiceSettings, onStatus?: (st: VoiceStatus) => void): Promise<void> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    this.status = onStatus;
    try {
      await configureAudioSession("playAndRecord");
    } catch {
      // the recogniser configures the session itself when it starts
    }
    await runVoiceCard(this.deps(), handlers, card, settings, controller.signal, (st) => {
      if (this.controller === controller) onStatus?.(st);
    });
    if (this.controller === controller) this.controller = undefined;
  }

  cancel() {
    if (!this.controller) return;
    this.controller.abort();
    this.controller = undefined;
    this.audio.cancel();
    void this.transcriber.stop().catch(() => undefined);
  }

  async dispose() {
    this.cancel();
    await deactivateAudioSession();
  }
}
