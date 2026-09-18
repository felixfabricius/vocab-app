import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Screen, Spinner } from "@/app/components/ui";
import { getAudio, repo } from "@/app/services";
import { draftContext, llmEnv } from "@/app/llmEnv";
import { useSettings } from "@/app/useSettings";
import type { EntryDraft } from "@/core/types";
import { translateWithClaude, type TranslateOutput } from "@/llm/pipelines";
import { Recorder } from "@/speech/recorder";
import { WhisperTranscriber } from "@/speech/WhisperTranscriber";
import { createBatch } from "@/features/import/importService";

type Dir = "en-es" | "es-en";

export function TranslateScreen() {
  const { settings } = useSettings();
  if (!settings) return <Spinner />;
  return (
    <Screen title="Translate">
      <p className="mb-3 text-sm text-muted">
        Offline and free translation lives in the four Shortcuts on your lock screen (see shortcuts/README.md). This screen is the Claude path: better for
        nuance and it can draft a card.
      </p>
      <Panel dir="en-es" title="English → Spanish" openaiKey={settings.openaiKey} hasClaude={!!settings.anthropicKey} rate={settings.speechRate} />
      <Panel dir="es-en" title="Spanish → English" openaiKey={settings.openaiKey} hasClaude={!!settings.anthropicKey} rate={settings.speechRate} />
    </Screen>
  );
}

function Panel({ dir, title, openaiKey, hasClaude, rate }: { dir: Dir; title: string; openaiKey?: string; hasClaude: boolean; rate: number }) {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranslateOutput | undefined>();
  const [busy, setBusy] = useState<"translate" | "record" | "transcribe" | undefined>();
  const [msg, setMsg] = useState<string | undefined>();
  const recorder = useRef(new Recorder());
  const audio = getAudio();
  const inputLang = dir === "en-es" ? "en" : "es";

  async function toggleRecord() {
    if (!openaiKey) {
      setMsg("Add an OpenAI key in Settings to use the microphone here, or use the keyboard's dictation key.");
      return;
    }
    if (recorder.current.recording) {
      setBusy("transcribe");
      try {
        const blob = await recorder.current.stop();
        const t = await new WhisperTranscriber(openaiKey).transcribe(blob, inputLang);
        setText(t);
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

  async function translate() {
    setBusy("translate");
    setMsg(undefined);
    try {
      const ctx = await draftContext();
      const r = await translateWithClaude(llmEnv, ctx, text.trim(), dir);
      setResult(r);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function addCard() {
    const es = dir === "en-es" ? result?.translation : text.trim();
    const en = dir === "en-es" ? text.trim() : result?.translation;
    if (!es || !en) return;
    const draft: EntryDraft = result?.draft ?? {
      lemma: es,
      pos: es.split(/\s+/).length > 1 ? "phrase" : "other",
      isPhrase: es.split(/\s+/).length > 1,
      senses: [{ gloss: en }],
      priority: "standard",
      regional: "neutral",
      fromSentence: [],
    };
    const batch = await createBatch(repo, { sourceType: "translate", label: `Translate: ${text.trim().slice(0, 40)}`, drafts: [draft] });
    nav(`/import/batch/${batch.id}`);
  }

  const spanishOut = dir === "en-es" ? result?.translation : undefined;

  return (
    <Card className="mb-4">
      <h2 className="mb-2 font-medium">{title}</h2>
      {msg && <div className="mb-2 rounded-lg bg-surface-2 p-2 text-xs">{msg}</div>}
      <div className="flex gap-2">
        <textarea
          className="h-20 flex-1 rounded-xl bg-surface-2 p-3 text-base"
          placeholder={dir === "en-es" ? "Type or dictate English" : "Escribe o dicta en español"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          lang={inputLang}
        />
        <button
          className={`w-14 rounded-xl text-2xl ${busy === "record" ? "bg-again/30 text-again" : "bg-surface-2"}`}
          disabled={busy === "transcribe" || !Recorder.supported()}
          onClick={() => void toggleRecord()}
          title={busy === "record" ? "Stop" : "Record"}
        >
          {busy === "record" ? "■" : busy === "transcribe" ? "…" : "🎤"}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" className="flex-1" disabled={!hasClaude || !text.trim() || busy === "translate"} onClick={() => void translate()}>
          {busy === "translate" ? "Translating…" : "Translate with Claude"}
        </Button>
        {dir === "es-en" && text.trim() && <Button onClick={() => void audio.speak(text.trim(), { rate })}>🔊</Button>}
      </div>
      {result && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-lg">{result.translation}</div>
            {spanishOut && <button className="text-xl" onClick={() => void audio.speak(spanishOut, { rate })}>🔊</button>}
          </div>
          {result.alternatives.length > 0 && <div className="mt-1 text-sm text-muted">also: {result.alternatives.join(" · ")}</div>}
          {result.note && <div className="mt-1 text-sm text-easy">{result.note}</div>}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">${result.usd.toFixed(3)}</span>
            <Button onClick={() => void addCard()}>{result.draft ? "Add as card" : "Add as simple card"}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
