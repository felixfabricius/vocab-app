import type { Transcriber } from "./Transcriber";

/** OpenAI audio transcription. Cost is cents per month at flashcard volumes. */
export class WhisperTranscriber implements Transcriber {
  constructor(private readonly apiKey: string, private readonly model = "whisper-1") {}

  available() {
    return !!this.apiKey;
  }

  async transcribe(audio: Blob, language: "es" | "en"): Promise<string> {
    const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("webm") ? "webm" : audio.type.includes("ogg") ? "ogg" : "wav";
    const form = new FormData();
    form.append("file", new File([audio], `speech.${ext}`, { type: audio.type || "audio/wav" }));
    form.append("model", this.model);
    form.append("language", language);
    form.append("response_format", "json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  }
}
