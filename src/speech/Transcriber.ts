/**
 * EXT: transcriber — speech-to-text for the translate screen (and, in the
 * native build, for "sí / no" grading). Phase 1 implements it with Whisper.
 */
export interface Transcriber {
  available(): boolean;
  transcribe(audio: Blob, language: "es" | "en"): Promise<string>;
}

export class NoopTranscriber implements Transcriber {
  available() {
    return false;
  }
  async transcribe(): Promise<string> {
    throw new Error("Speech recognition is not configured. Add an OpenAI key in Settings.");
  }
}
