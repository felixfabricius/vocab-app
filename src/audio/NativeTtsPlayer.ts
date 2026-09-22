/**
 * AudioPlayer over the native text-to-speech plugin. Unlike Web Speech in
 * Safari, AVSpeechSynthesizer lists the downloaded enhanced voices, so the
 * es-CL voice (Francisca) is selectable here.
 */
import type { AudioPlayer, SpeakOptions, VoiceInfo } from "./AudioPlayer";
import { VARIETY } from "@/config/variety";
import { nativeSpeak, nativeStop, nativeVoices, type NativeVoice } from "@/native/tts";

/** Higher is better; iOS identifiers carry the quality tier. */
function quality(v: NativeVoice): number {
  const id = v.id.toLowerCase();
  if (id.includes("premium")) return 3;
  if (id.includes("enhanced")) return 2;
  return v.local ? 1 : 0;
}

export class NativeTtsPlayer implements AudioPlayer {
  private voiceId: string | undefined;
  private cache: NativeVoice[] | undefined;
  private loading: Promise<NativeVoice[]> | undefined;

  constructor(voiceId?: string) {
    this.voiceId = voiceId;
    void this.load();
  }

  private load(): Promise<NativeVoice[]> {
    if (this.cache) return Promise.resolve(this.cache);
    if (!this.loading) {
      this.loading = nativeVoices()
        .then((v) => {
          this.cache = v;
          return v;
        })
        .finally(() => {
          this.loading = undefined;
        });
    }
    return this.loading;
  }

  async voices(): Promise<VoiceInfo[]> {
    return this.load();
  }

  setVoice(id: string | undefined) {
    this.voiceId = id;
  }

  unlock() {
    // Native audio needs no gesture.
  }

  private pick(all: NativeVoice[], lang?: string): NativeVoice | undefined {
    if (this.voiceId && !lang) {
      const chosen = all.find((v) => v.id === this.voiceId);
      if (chosen) return chosen;
    }
    const wanted = [lang ?? VARIETY.ttsLocale, ...(lang ? [] : VARIETY.ttsFallbackLocales)].map((l) => l.toLowerCase());
    for (const w of wanted) {
      const exact = all.filter((v) => v.lang.toLowerCase().replace("_", "-") === w);
      if (exact.length > 0) return exact.sort((a, b) => quality(b) - quality(a))[0];
    }
    const prefix = (lang ?? VARIETY.ttsLocale).slice(0, 2).toLowerCase();
    const same = all.filter((v) => v.lang.toLowerCase().startsWith(prefix));
    return same.sort((a, b) => quality(b) - quality(a))[0];
  }

  async speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!text.trim()) return;
    const all = await this.load();
    const voice = this.pick(all, opts.lang);
    await nativeSpeak(text, {
      lang: voice?.lang ?? opts.lang ?? VARIETY.ttsLocale,
      rate: opts.rate ?? 1,
      ...(voice ? { voiceIndex: voice.index } : {}),
    });
  }

  async play(_clipKey: string): Promise<boolean> {
    return false;
  }

  cancel() {
    void nativeStop();
  }
}
