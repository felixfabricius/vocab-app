import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Row, Screen, Spinner } from "@/app/components/ui";
import { getAudio, repo } from "@/app/services";
import { useSettings } from "@/app/useSettings";
import type { PlaybackMode } from "@/core/types";
import { exportBackup, importBackup, parseBackup, saveBackupFile } from "@/storage/backup";
import type { VoiceInfo } from "@/audio/AudioPlayer";
import { MODEL_CHOICES } from "@/llm/pricing";
import { isNative } from "@/native/platform";

export function SettingsScreen() {
  const nav = useNavigate();
  const { settings, update } = useSettings();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [msg, setMsg] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const audio = getAudio();

  useEffect(() => {
    let alive = true;
    const load = () => {
      void audio.voices().then((all) => alive && setVoices(all.filter((v) => v.lang.toLowerCase().startsWith("es"))));
    };
    load();
    if (isNative()) return () => void (alive = false);
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => {
      alive = false;
      window.speechSynthesis?.removeEventListener("voiceschanged", load);
    };
  }, [audio]);

  useEffect(() => {
    if (settings) audio.setVoice(settings.voiceURI);
  }, [settings, audio]);

  if (!settings) return <Spinner />;

  async function onExport() {
    try {
      const b = await exportBackup(repo);
      const how = await saveBackupFile(b);
      setMsg(how === "shared" ? "Backup shared" : "Backup downloaded");
    } catch (e) {
      setMsg(`Export failed: ${String(e)}`);
    }
  }

  async function onImportFile(file: File, mode: "replace" | "merge") {
    try {
      const parsed = parseBackup(await file.text());
      await importBackup(repo, parsed, mode);
      setMsg(`Imported backup from ${parsed.exportedAt.slice(0, 16).replace("T", " ")} (${mode})`);
    } catch (e) {
      setMsg(`Import failed: ${String(e)}`);
    }
  }

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  return (
    <Screen title="Settings">
      {msg && <div className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">{msg}</div>}

      <Card className="mb-4">
        <h2 className="mb-1 font-medium">Learning</h2>
        <Row label="New cards per day">
          <input
            type="number"
            inputMode="numeric"
            className="w-20 rounded-lg bg-surface-2 px-2 py-1 text-right"
            value={settings.dailyNewLimit}
            onChange={(e) => void update({ dailyNewLimit: num(e.target.value, settings.dailyNewLimit) })}
          />
        </Row>
        <Row label="Max reviews per session">
          <input
            type="number"
            inputMode="numeric"
            className="w-20 rounded-lg bg-surface-2 px-2 py-1 text-right"
            value={settings.sessionCap}
            onChange={(e) => void update({ sessionCap: num(e.target.value, settings.sessionCap) })}
          />
        </Row>
        <Row label="Day starts at">
          <select
            className="rounded-lg bg-surface-2 px-2 py-1"
            value={settings.dayRolloverHour}
            onChange={(e) => void update({ dayRolloverHour: Number(e.target.value) })}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Row>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-medium">Audio</h2>
        <Row label="Playback">
          <select
            className="rounded-lg bg-surface-2 px-2 py-1"
            value={settings.playback}
            onChange={(e) => void update({ playback: e.target.value as PlaybackMode })}
          >
            <option value="display">Display only</option>
            <option value="audioOn">Audio on flip</option>
          </select>
        </Row>
        <Row label="Voice">
          <select
            className="max-w-[12rem] rounded-lg bg-surface-2 px-2 py-1"
            value={settings.voiceURI ?? ""}
            onChange={(e) => void update({ voiceURI: e.target.value || undefined })}
          >
            <option value="">Automatic (es-CL preferred)</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </Row>
        <Row label="Speed">
          <input
            type="range"
            min={0.6}
            max={1.2}
            step={0.05}
            value={settings.speechRate}
            onChange={(e) => void update({ speechRate: Number(e.target.value) })}
          />
          <span className="w-10 text-right text-sm">{settings.speechRate.toFixed(2)}</span>
        </Row>
        <Button
          className="mt-2 w-full"
          onClick={() => {
            audio.unlock();
            void audio.speak("Hola, ¿cómo estás? Vamos a hacer planes.", { rate: settings.speechRate });
          }}
        >
          Test voice
        </Button>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-medium">Claude API</h2>
        <p className="mb-2 text-sm text-muted">Used for photo, text and word imports and for in-app translation. The key stays on this phone.</p>
        <input
          type="password"
          autoComplete="off"
          className="mb-2 w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          placeholder="sk-ant-…"
          defaultValue={settings.anthropicKey ?? ""}
          onBlur={(e) => void update({ anthropicKey: e.target.value.trim() || undefined })}
        />
        <Row label="Model">
          <select className="rounded-lg bg-surface-2 px-2 py-1" value={settings.model} onChange={(e) => void update({ model: e.target.value })}>
            {MODEL_CHOICES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Daily spend warning (USD)">
          <input
            type="number"
            step={0.5}
            inputMode="decimal"
            className="w-20 rounded-lg bg-surface-2 px-2 py-1 text-right"
            value={settings.dailySpendCapUsd}
            onChange={(e) => void update({ dailySpendCapUsd: num(e.target.value, settings.dailySpendCapUsd) })}
          />
        </Row>
        {settings.llmUsage && (
          <p className="mt-1 text-xs text-muted">
            {settings.llmUsage.month}: {settings.llmUsage.calls} calls · ${settings.llmUsage.usd.toFixed(2)} · today ${settings.llmUsage.todayUsd.toFixed(2)}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">OpenAI key (optional, for microphone transcription in Translate):</p>
        <input
          type="password"
          autoComplete="off"
          className="mt-1 w-full rounded-lg bg-surface-2 px-3 py-2 text-sm"
          placeholder="sk-…"
          defaultValue={settings.openaiKey ?? ""}
          onBlur={(e) => void update({ openaiKey: e.target.value.trim() || undefined })}
        />
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-medium">Backup</h2>
        <p className="mb-3 text-sm text-muted">
          Everything lives on this phone. Export regularly and keep the file in iCloud Drive.
        </p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => void onExport()}>
            Export backup
          </Button>
          <Button className="flex-1" onClick={() => fileInput.current?.click()}>
            Import backup
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const replace = window.confirm("Replace everything on this phone with the backup?\n\nCancel = merge (newer rows win).");
            void onImportFile(f, replace ? "replace" : "merge");
            e.target.value = "";
          }}
        />
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 font-medium">Device checks</h2>
        <Button className="w-full" onClick={() => nav("/diagnostics")}>
          Open diagnostics
        </Button>
      </Card>

      <Card>
        <h2 className="mb-1 font-medium text-again">Danger zone</h2>
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (window.confirm("Delete all data on this phone? Export a backup first.")) {
              void repo.clearAll().then(() => {
                setMsg("All data deleted. Reload to re-seed.");
              });
            }
          }}
        >
          Delete all data
        </Button>
      </Card>
    </Screen>
  );
}
