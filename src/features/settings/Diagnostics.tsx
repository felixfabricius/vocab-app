import { useEffect, useState } from "react";
import { getAudio } from "@/app/services";
import { clearLog, getLog, subscribeLog } from "@/app/log";
import type { VoiceInfo } from "@/audio/AudioPlayer";
import { isNative, platform } from "@/native/platform";
import { copyText } from "@/native/clipboard";
import { speechAvailable } from "@/native/speech";
import { packDetails, translateLanguages } from "@/native/translate";
import { NativeCloudFiles } from "@/native/cloudFiles";
import { VARIETY } from "@/config/variety";

/**
 * Device checks: which Spanish voices the platform exposes (Web Speech on the
 * web, AVSpeechSynthesizer natively), whether speech plays after a tap, the
 * camera and microphone, storage persistence, and the in-app log.
 */
export function Diagnostics() {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [spoken, setSpoken] = useState<string>("");
  const [photo, setPhoto] = useState<string>("");
  const [mic, setMic] = useState<string>("");
  const [storage, setStorage] = useState<string>("checking…");
  const [log, setLog] = useState<string[]>(getLog());
  const [copied, setCopied] = useState(false);
  const [plugins, setPlugins] = useState<string[]>([]);
  const audio = getAudio();

  useEffect(() => {
    let alive = true;
    const load = () => void audio.voices().then((v) => alive && setVoices(v));
    load();
    if (isNative()) return () => void (alive = false);
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => {
      alive = false;
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
    };
  }, [audio]);

  useEffect(() => subscribeLog(() => setLog([...getLog()])), []);

  useEffect(() => {
    (async () => {
      try {
        const persisted = await navigator.storage?.persisted?.();
        const est = await navigator.storage?.estimate?.();
        const mb = est?.quota ? Math.round(est.quota / 1e6) : undefined;
        const used = est?.usage ? Math.round(est.usage / 1e6) : undefined;
        setStorage(`persisted=${String(persisted)} used≈${used ?? "?"} MB quota≈${mb ?? "?"} MB`);
      } catch (e) {
        setStorage(`error: ${String(e)}`);
      }
    })();
  }, []);

  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  async function speak(voice?: VoiceInfo) {
    audio.unlock();
    audio.setVoice(voice?.id);
    setSpoken(voice ? `${voice.name} (${voice.lang}) …` : "default …");
    try {
      await audio.speak("Hola, ¿cómo estái? Vamos a hacer planes."); // VARIETY: es-CL test sentence
      setSpoken(voice ? `${voice.name} (${voice.lang}) done` : "default done");
    } catch (e) {
      setSpoken(`error: ${(e as Error).message}`);
    }
  }

  async function testMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks();
      setMic(`ok: ${tracks[0]?.label || "audio track"}`);
      tracks.forEach((t) => t.stop());
    } catch (e) {
      setMic(`error: ${(e as Error).name} ${(e as Error).message}`);
    }
  }

  function copyLog() {
    copyText(log.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((e: Error) => setMic(`clipboard: ${e.message}`));
  }

  async function checkPlugins() {
    const out: string[] = [];
    const probe = async (label: string, fn: () => Promise<unknown>) => {
      try {
        out.push(`${label}: ${JSON.stringify(await fn())}`);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        out.push(`${label}: ERROR ${err.code ?? ""} ${err.message ?? String(e)}`);
      }
    };
    await probe("Speech es", () => speechAvailable(VARIETY.asrLocale));
    await probe("Speech en", () => speechAvailable("en-US"));
    await probe("Translate languages", () => translateLanguages());
    await probe("Translate en-es", () => packDetails("en-es"));
    await probe("Translate es-en", () => packDetails("es-en"));
    await probe("CloudFiles", () => new NativeCloudFiles().available());
    setPlugins(out);
  }

  return (
    <div className="screen-scroll">
    <div className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Diagnostics</h1>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 font-medium">Environment</h2>
        <p className="text-sm text-muted">platform: {platform()}{isNative() ? " (native)" : ""}</p>
        <p className="text-sm text-muted">installed: {String(standalone)}</p>
        <p className="text-sm text-muted">origin: {window.location.origin}</p>
        <p className="text-sm text-muted">storage: {storage}{isNative() ? " (the native web view's store is persistent regardless of the flag)" : ""}</p>
        <p className="text-sm text-muted">online: {String(navigator.onLine)}</p>
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 font-medium">
          Spanish voices ({spanish.length} of {voices.length})
        </h2>
        {spanish.length === 0 && (
          <p className="text-sm text-muted">None listed yet. Tap "Speak default" once; iOS loads voices after the first speech call.</p>
        )}
        <ul className="space-y-1">
          {spanish.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                {v.name} <span className="text-muted">{v.lang}</span>
                {v.local ? "" : " (network)"}
                <span className="block truncate text-[10px] text-muted/70">{v.id}</span>
              </span>
              <button className="shrink-0 rounded-md bg-surface-2 px-3 py-1" onClick={() => void speak(v)}>
                Speak
              </button>
            </li>
          ))}
        </ul>
        <button className="mt-3 rounded-md bg-accent px-3 py-2 text-bg" onClick={() => void speak()}>
          Speak default
        </button>
        {spoken && <p className="mt-2 text-sm text-muted">last: {spoken}</p>}
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 font-medium">Camera</h2>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto(`${f.name} ${Math.round(f.size / 1024)} KB`);
          }}
        />
        {photo && <p className="mt-2 text-sm text-muted">{photo}</p>}
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 font-medium">Microphone</h2>
        <button className="rounded-md bg-surface-2 px-3 py-1 text-sm" onClick={() => void testMic()}>
          Request microphone
        </button>
        {mic && <p className="mt-2 text-sm text-muted">{mic}</p>}
      </section>

      {isNative() && (
        <section className="rounded-xl bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Native plugins</h2>
            <button className="rounded-md bg-surface-2 px-3 py-1 text-sm" onClick={() => void checkPlugins()}>
              Check
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words text-[11px] leading-snug text-muted">{plugins.join("\n")}</pre>
        </section>
      )}

      <section className="rounded-xl bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-medium">Log ({log.length})</h2>
          <div className="flex gap-2 text-sm">
            <button className="rounded-md bg-surface-2 px-3 py-1" onClick={copyLog}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button className="rounded-md bg-surface-2 px-3 py-1" onClick={() => { clearLog(); setLog([]); }}>
              Clear
            </button>
          </div>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-snug text-muted">
          {log.slice(-100).join("\n")}
        </pre>
      </section>
    </div>
    </div>
  );
}
