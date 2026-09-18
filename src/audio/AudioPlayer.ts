/**
 * EXT: audio — the review screen only talks to this interface. Phase 1 uses the
 * Web Speech API; the native build adds a TTS plugin with background playback,
 * and pre-generated clips are played through `play`.
 */
export interface SpeakOptions {
  rate?: number;
  /** BCP-47 locale hint; the player picks the best voice it has for it */
  lang?: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  lang: string;
  local: boolean;
}

export interface AudioPlayer {
  /** Speak text; resolves when finished or cancelled. */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  /** Play a cached clip by key; resolves false if the clip is missing. */
  play(clipKey: string): Promise<boolean>;
  cancel(): void;
  voices(): VoiceInfo[];
  setVoice(id: string | undefined): void;
  /** Some platforms need a user gesture before audio works; call from a tap handler. */
  unlock(): void;
}
