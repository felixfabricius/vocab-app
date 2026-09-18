/** Microphone recording via MediaRecorder; picks a container the platform supports. */
export class Recorder {
  private recorder: MediaRecorder | undefined;
  private chunks: Blob[] = [];
  private stream: MediaStream | undefined;

  static supported(): boolean {
    return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const r = this.recorder;
      if (!r) return reject(new Error("Not recording"));
      r.onstop = () => {
        const blob = new Blob(this.chunks, { type: r.mimeType || "audio/wav" });
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = undefined;
        this.recorder = undefined;
        resolve(blob);
      };
      r.stop();
    });
  }

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }
}
