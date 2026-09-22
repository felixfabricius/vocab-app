/**
 * EXT: transcriber — streaming recognition: partial text while the user speaks,
 * final text on stop. The native implementation runs on-device; the web app has
 * none (it records a blob and sends it to Whisper, see `Transcriber`).
 */
import { VARIETY } from "@/config/variety";
import { onSpeechEnd, onSpeechPartial, speechAvailable, speechRequestPermissions, speechStart, speechStop, type SpeechEndReason } from "@/native/speech";

export interface LiveOptions {
  /** words the recogniser should favour (sí, no, otra vez) */
  contextualStrings?: string[];
  maxSeconds?: number;
  silenceSeconds?: number;
  taskHint?: "dictation" | "confirmation";
}

export interface LiveTranscriber {
  available(lang: "es" | "en"): Promise<boolean>;
  /** Resolves once listening has started; `onPartial` fires while speaking, `onEnd` once. */
  start(lang: "es" | "en", opts: LiveOptions, onPartial: (text: string) => void, onEnd: (text: string, reason: SpeechEndReason) => void): Promise<void>;
  stop(): Promise<string>;
}

function localeFor(lang: "es" | "en"): string {
  return lang === "es" ? VARIETY.asrLocale : "en-US"; // LANG
}

export class NativeLiveTranscriber implements LiveTranscriber {
  private off: (() => void)[] = [];

  async available(lang: "es" | "en"): Promise<boolean> {
    const a = await speechAvailable(localeFor(lang));
    return a.available;
  }

  async start(lang: "es" | "en", opts: LiveOptions, onPartial: (text: string) => void, onEnd: (text: string, reason: SpeechEndReason) => void): Promise<void> {
    const a = await speechAvailable(localeFor(lang));
    if (!a.authorized) {
      const p = await speechRequestPermissions();
      if (!p.speech || !p.microphone) throw new Error("Microphone or speech recognition permission was not granted.");
    }
    this.detach();
    this.off.push(onSpeechPartial((e) => onPartial(e.text)));
    this.off.push(
      onSpeechEnd((e) => {
        this.detach();
        onEnd(e.text, e.reason);
      }),
    );
    await speechStart({
      locale: localeFor(lang),
      onDevice: true,
      ...(opts.contextualStrings ? { contextualStrings: opts.contextualStrings } : {}),
      ...(opts.maxSeconds ? { maxSeconds: opts.maxSeconds } : {}),
      ...(opts.silenceSeconds ? { silenceSeconds: opts.silenceSeconds } : {}),
      ...(opts.taskHint ? { taskHint: opts.taskHint } : {}),
    });
  }

  async stop(): Promise<string> {
    const text = await speechStop();
    this.detach();
    return text;
  }

  private detach() {
    for (const f of this.off) f();
    this.off = [];
  }
}
