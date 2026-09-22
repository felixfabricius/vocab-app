/**
 * Facade over @capacitor-community/text-to-speech (AVSpeechSynthesizer).
 * `voice` is an index into the list returned by `voices()`, in the plugin's order.
 */
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import type { VoiceInfo } from "@/audio/AudioPlayer";
import { toNativeError } from "./platform";

export interface NativeVoice extends VoiceInfo {
  index: number;
}

export async function nativeVoices(): Promise<NativeVoice[]> {
  try {
    const { voices } = await TextToSpeech.getSupportedVoices();
    return voices.map((v, index) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService, index }));
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function nativeSpeak(text: string, opts: { lang: string; rate: number; voiceIndex?: number }): Promise<void> {
  try {
    await TextToSpeech.speak({
      text,
      lang: opts.lang,
      rate: opts.rate,
      ...(opts.voiceIndex !== undefined ? { voice: opts.voiceIndex } : {}),
      category: "playback",
      queueStrategy: 0,
    });
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function nativeStop(): Promise<void> {
  try {
    await TextToSpeech.stop();
  } catch {
    // stopping when nothing plays is not an error
  }
}
