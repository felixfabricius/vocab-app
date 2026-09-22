import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button, Card, Screen, Spinner } from "@/app/components/ui";
import { getAudio, repo } from "@/app/services";
import { draftContext, llmEnv } from "@/app/llmEnv";
import { useSettings } from "@/app/useSettings";
import type { Lookup, Settings } from "@/core/types";
import { translateWithClaude, type TranslateOutput } from "@/llm/pipelines";
import { isNative } from "@/native/platform";
import { packStatus, translateOffline, type PackStatus } from "@/native/translate";
import { NativeLiveTranscriber } from "@/speech/LiveTranscriber";
import { Recorder } from "@/speech/recorder";
import { WhisperTranscriber } from "@/speech/WhisperTranscriber";
import { newLookup } from "./lookupsService";

type Dir = "en-es" | "es-en";

/**
 * EXT: translate — offline Apple translation is the default on iOS; Claude stays
 * the explicit button (nuance, and it drafts a card). Every lookup is logged and
 * becomes a draft on the next "Create cards from lookups".
 */
export function TranslateScreen() {
  const { settings } = useSettings();
  const [params] = useSearchParams();
  const focusDir = (params.get("dir") as Dir | null) ?? undefined;
  const [lookups, setLookups] = useState<Lookup[]>([]);

  const refresh = useCallback(async () => {
    setLookups(await repo.listLookups({ limit: 20 }));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!settings) return <Spinner />;
  const native = isNative();
  return (
    <Screen title="Translate">
      {!native && (
        <p className="mb-3 text-sm text-muted">Offline translation exists in the native app only; here every translation goes through Claude.</p>
      )}
      <Panel dir="en-es" title="English → Spanish" settings={settings} autoFocus={focusDir === "en-es"} history={lookups.filter((l) => l.dir === "en-es")} onLookup={refresh} />
      <Panel dir="es-en" title="Spanish → English" settings={settings} autoFocus={focusDir === "es-en"} history={lookups.filter((l) => l.dir === "es-en")} onLookup={refresh} />
    </Screen>
  );
}

function Panel({ dir, title, settings, autoFocus, history, onLookup }: { dir: Dir; title: string; settings: Settings; autoFocus: boolean; history: Lookup[]; onLookup: () => void }) {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ translation: string; provider: "apple" | "claude"; claude?: TranslateOutput } | undefined>();
  const [busy, setBusy] = useState<"translate" | "record" | "transcribe" | undefined>();
  const [msg, setMsg] = useState<string | undefined>();
  const [pack, setPack] = useState<PackStatus | undefined>();
  const recorder = useRef(new Recorder());
  const live = useRef(new NativeLiveTranscriber());
  const field = useRef<HTMLTextAreaElement>(null);
  const audio = getAudio();
  const native = isNative();
  const inputLang: "es" | "en" = dir === "en-es" ? "en" : "es";
  const hasClaude = !!settings.anthropicKey;
  const offlineDefault = native && settings.translateProvider === "apple";

  useEffect(() => {
    if (native) void packStatus(dir).then(setPack).catch(() => setPack("unsupported"));
  }, [dir, native]);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  async function log(translation: string, provider: "apple" | "claude", claude?: TranslateOutput) {
    await repo.putLookups([newLookup({ dir, src: text.trim(), dst: translation, provider, ...(claude?.draft ? { draft: claude.draft } : {}) })]);
    onLookup();
  }

  async function translate(provider: "apple" | "claude") {
    const input = text.trim();
    if (!input) return;
    setBusy("translate");
    setMsg(undefined);
    try {
      if (provider === "apple") {
        const translation = await translateOffline(input, dir);
        setResult({ translation, provider });
        await log(translation, provider);
      } else {
        const r = await translateWithClaude(llmEnv, await draftContext(), input, dir);
        setResult({ translation: r.translation, provider, claude: r });
        await log(r.translation, provider, r);
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function toggleMic() {
    if (native) {
      if (busy === "record") {
        setBusy("transcribe");
        try {
          const final = await live.current.stop();
          if (final) setText(final);
        } catch (e) {
          setMsg((e as Error).message);
        } finally {
          setBusy(undefined);
        }
        return;
      }
      try {
        setMsg(undefined);
        await live.current.start(
          inputLang,
          { maxSeconds: 30, silenceSeconds: 2 },
          (partial) => setText(partial),
          (final) => {
            if (final) setText(final);
            setBusy(undefined);
          },
        );
        setBusy("record");
      } catch (e) {
        setMsg(`Microphone: ${(e as Error).message}`);
        setBusy(undefined);
      }
      return;
    }
    // Web: record a blob and send it to Whisper.
    if (!settings.openaiKey) {
      setMsg("Add an OpenAI key in Settings to use the microphone here, or use the keyboard's dictation key.");
      return;
    }
    if (recorder.current.recording) {
      setBusy("transcribe");
      try {
        const blob = await recorder.current.stop();
        setText(await new WhisperTranscriber(settings.openaiKey).transcribe(blob, inputLang));
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        setBusy(undefined);
      }
      return;
    }
    try {
      await recorder.current.start();
      setBusy("record");
    } catch (e) {
      setMsg(`Microphone: ${(e as Error).message}`);
    }
  }

  const spanish = dir === "en-es" ? result?.translation : text.trim();
  const micSupported = native || Recorder.supported();
  const offlineReady = offlineDefault && pack === "installed";
  const primary: "apple" | "claude" = offlineReady ? "apple" : "claude";

  return (
    <Card className="mb-4">
      <h2 className="mb-2 font-medium">{title}</h2>
      {msg && <div className="mb-2 rounded-lg bg-surface-2 p-2 text-xs">{msg}</div>}
      {native && pack && pack !== "installed" && (
        <div className="mb-2 rounded-lg bg-easy/10 p-2 text-xs text-easy">
          {pack === "supported" ? "Offline pack not downloaded yet (Settings → Translate)." : "Offline translation is not available for this pair."}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          ref={field}
          className="h-20 flex-1 rounded-xl bg-surface-2 p-3 text-base"
          placeholder={dir === "en-es" ? "Type or dictate English" : "Escribe o dicta en español"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          lang={inputLang}
          enterKeyHint="go"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void translate(primary);
            }
          }}
        />
        <button
          className={`w-14 rounded-xl text-2xl ${busy === "record" ? "bg-again/30 text-again" : "bg-surface-2"}`}
          disabled={busy === "transcribe" || !micSupported}
          onClick={() => void toggleMic()}
          title={busy === "record" ? "Stop" : "Dictate"}
        >
          {busy === "record" ? "■" : busy === "transcribe" ? "…" : "🎤"}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {offlineDefault ? (
          <>
            <Button variant="primary" className="flex-1" disabled={pack !== "installed" || !text.trim() || busy === "translate"} onClick={() => void translate("apple")}>
              {busy === "translate" ? "Translating…" : "Translate"}
            </Button>
            <Button disabled={!hasClaude || !text.trim() || busy === "translate"} onClick={() => void translate("claude")}>
              With Claude
            </Button>
          </>
        ) : (
          <Button variant="primary" className="flex-1" disabled={!hasClaude || !text.trim() || busy === "translate"} onClick={() => void translate("claude")}>
            {busy === "translate" ? "Translating…" : "Translate with Claude"}
          </Button>
        )}
        {dir === "es-en" && text.trim() && (
          <Button onClick={() => void audio.speak(text.trim(), { rate: settings.speechRate })} title="Speak">
            🔊
          </Button>
        )}
      </div>
      {result && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-lg">{result.translation}</div>
            {spanish && (
              <button className="text-xl" onClick={() => void audio.speak(spanish, { rate: settings.speechRate })} title="Speak">
                🔊
              </button>
            )}
          </div>
          {result.claude && result.claude.alternatives.length > 0 && <div className="mt-1 text-sm text-muted">also: {result.claude.alternatives.join(" · ")}</div>}
          {result.claude?.note && <div className="mt-1 text-sm text-easy">{result.claude.note}</div>}
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>{result.provider === "apple" ? "offline" : `Claude · $${result.claude?.usd.toFixed(3)}`}</span>
            <button className="underline" onClick={() => nav("/import")}>
              saved as lookup
            </button>
          </div>
        </div>
      )}
      {history.length > 0 && (
        <ul className="mt-3 divide-y divide-surface-2 text-sm">
          {history.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <button
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => {
                  setText(l.src);
                  setResult({ translation: l.dst, provider: l.provider === "claude" ? "claude" : "apple" });
                }}
              >
                <span className="text-muted">{l.src}</span> <span className="text-muted/60">→</span> {l.dst}
              </button>
              {!l.consumedAt && <span className="shrink-0 text-[10px] text-accent">new</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
