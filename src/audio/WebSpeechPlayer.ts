import type { AudioPlayer, SpeakOptions, VoiceInfo } from "./AudioPlayer";
import { VARIETY } from "@/config/variety";

/**
 * Web Speech API implementation. iOS quirks handled here:
 *  - voices load asynchronously and sometimes only after the first speak();
 *  - speaking must be started from a user gesture at least once per page;
 *  - a pending utterance keeps the queue busy, so cancel() before speak().
 */
export class WebSpeechPlayer implements AudioPlayer {
  private voiceId: string | undefined;
  private cached: SpeechSynthesisVoice[] = [];
  private unlocked = false;

  constructor(voiceId?: string) {
    this.voiceId = voiceId;
    this.refreshVoices();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.addEventListener("voiceschanged", () => this.refreshVoices());
    }
  }

  private refreshVoices() {
    this.cached = window.speechSynthesis?.getVoices() ?? [];
  }

  async voices(): Promise<VoiceInfo[]> {
    this.refreshVoices();
    return this.cached.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
  }

  setVoice(id: string | undefined) {
    this.voiceId = id;
  }

  unlock() {
    if (this.unlocked || !window.speechSynthesis) return;
    // An empty utterance started from a tap satisfies iOS's gesture requirement.
    const u = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(u);
    this.unlocked = true;
  }

  private pickVoice(lang?: string): SpeechSynthesisVoice | undefined {
    this.refreshVoices();
    if (this.voiceId) {
      const chosen = this.cached.find((v) => v.voiceURI === this.voiceId);
      if (chosen) return chosen;
    }
    const wanted = [lang ?? VARIETY.ttsLocale, ...VARIETY.ttsFallbackLocales].map((l) => l.toLowerCase());
    for (const w of wanted) {
      const exact = this.cached.filter((v) => v.lang.toLowerCase().replace("_", "-") === w);
      if (exact.length > 0) {
        // Prefer enhanced/premium voices: iOS names them the same, so prefer local + longest URI heuristically.
        exact.sort((a, b) => Number(b.localService) - Number(a.localService) || b.voiceURI.length - a.voiceURI.length);
        return exact[0];
      }
    }
    const anyEs = this.cached.find((v) => v.lang.toLowerCase().startsWith("es"));
    return anyEs;
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    const synth = window.speechSynthesis;
    if (!synth || !text.trim()) return Promise.resolve();
    synth.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = this.pickVoice(opts.lang);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? opts.lang ?? VARIETY.ttsLocale;
      u.rate = opts.rate ?? 1;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      u.onend = finish;
      u.onerror = finish;
      // Safety net: iOS occasionally never fires onend for cancelled utterances.
      const ms = Math.min(20000, 1500 + text.length * 90);
      setTimeout(finish, ms);
      synth.speak(u);
    });
  }

  async play(_clipKey: string): Promise<boolean> {
    // EXT: audio — cached clips (Azure) are a later addition.
    return false;
  }

  cancel() {
    window.speechSynthesis?.cancel();
  }
}
