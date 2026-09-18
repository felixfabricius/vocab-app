import { useEffect, useState } from "react";

/**
 * Day-one device checks: which Spanish voices the Web Speech API exposes,
 * whether speech works after a tap, whether the camera input opens, and
 * whether the app is running installed (standalone) with persistent storage.
 */
export function Diagnostics() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [spoken, setSpoken] = useState<string>("");
  const [photo, setPhoto] = useState<string>("");
  const [storage, setStorage] = useState<string>("checking…");

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const persisted = await navigator.storage?.persisted?.();
        const est = await navigator.storage?.estimate?.();
        const mb = est?.quota ? Math.round(est.quota / 1e6) : undefined;
        setStorage(`persisted=${String(persisted)} quota≈${mb ?? "?"} MB`);
      } catch (e) {
        setStorage(`error: ${String(e)}`);
      }
    })();
  }, []);

  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  function speak(voice?: SpeechSynthesisVoice) {
    const u = new SpeechSynthesisUtterance("Hola, ¿cómo estái? Vamos a hacer planes.");
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "es-CL"; // VARIETY: default locale
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpoken(voice ? `${voice.name} (${voice.lang})` : "default");
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Diagnostics</h1>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 font-medium">Environment</h2>
        <p className="text-sm text-muted">installed: {String(standalone)}</p>
        <p className="text-sm text-muted">storage: {storage}</p>
        <p className="text-sm text-muted">online: {String(navigator.onLine)}</p>
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h2 className="mb-2 font-medium">Spanish voices ({spanish.length} of {voices.length})</h2>
        {spanish.length === 0 && (
          <p className="text-sm text-muted">
            None listed yet. Tap "Speak default" once; iOS loads voices after the first
            speech call.
          </p>
        )}
        <ul className="space-y-1">
          {spanish.map((v) => (
            <li key={v.voiceURI} className="flex items-center justify-between text-sm">
              <span>
                {v.name} <span className="text-muted">{v.lang}</span>
                {v.localService ? "" : " (network)"}
              </span>
              <button
                className="rounded-md bg-surface-2 px-3 py-1"
                onClick={() => speak(v)}
              >
                Speak
              </button>
            </li>
          ))}
        </ul>
        <button
          className="mt-3 rounded-md bg-accent px-3 py-2 text-bg"
          onClick={() => speak()}
        >
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
    </div>
  );
}
