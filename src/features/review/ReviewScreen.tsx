import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button, Spinner } from "@/app/components/ui";
import { getAudio, repo, schedulerFor } from "@/app/services";
import { newId } from "@/core/ids";
import { buildSession, buildTagSession } from "@/core/scheduler/session";
import { dayEnd } from "@/core/scheduler/day";
import * as rs from "@/core/review/session";
import type { Entry, GradeName, Settings } from "@/core/types";
import { conjugate, loadVerbTable, type TenseId } from "@/core/verbs";
import { tenseLabel } from "@/features/grammar/tenseService";
import { CardBack, CardFront, spokenBack, type CardContent } from "./CardView";
import { useSwipe, type SwipeDir } from "./useSwipe";

type Phase = "loading" | "reviewing" | "done";

export function ReviewScreen() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  // /review?tag=<tag>&all=1 studies one tag (due → learning → new, no caps); plain /review is today's session.
  const tag = params.get("tag") ?? undefined;
  const includeAll = params.get("all") === "1";
  const [phase, setPhase] = useState<Phase>("loading");
  const [settings, setSettings] = useState<Settings | undefined>();
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [state, setState] = useState<rs.ReviewState | undefined>();
  const [content, setContent] = useState<CardContent | undefined>();
  const [showHint, setShowHint] = useState(false);
  const contentCache = useRef(new Map<string, CardContent>());
  const audio = getAudio();

  const env = useMemo<rs.ReviewEnv | undefined>(() => {
    if (!settings) return undefined;
    return {
      now: () => new Date(),
      newId,
      schedulerFor: (p) => schedulerFor(settings, p),
      priorityOf: (card) => entries.get(card.entryId)?.priority ?? "niche",
      leechThresholdOf: (card) => settings.leechThreshold[entries.get(card.entryId)?.priority ?? "niche"],
      rolloverHour: settings.dayRolloverHour,
      mode: settings.playback === "display" ? "tap" : "audio",
    };
  }, [settings, entries]);

  // Load session
  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, cards, ents] = await Promise.all([repo.getSettings(), repo.allCards(), repo.allActiveEntriesById()]);
      const session = tag
        ? buildTagSession({ cards, entriesById: ents, settings: s, now: new Date(), tag, includeAll })
        : buildSession({ cards, entriesById: ents, settings: s, now: new Date() });
      if (!alive) return;
      setSettings(s);
      setEntries(ents);
      audio.setVoice(s.voiceURI);
      const initial = rs.createReviewState([...session.due, ...session.fresh], session.learning);
      const env0: rs.ReviewEnv = {
        now: () => new Date(),
        newId,
        schedulerFor: (p) => schedulerFor(s, p),
        priorityOf: (card) => ents.get(card.entryId)?.priority ?? "niche",
        leechThresholdOf: (card) => s.leechThreshold[ents.get(card.entryId)?.priority ?? "niche"],
        rolloverHour: s.dayRolloverHour,
        mode: "tap",
      };
      const started = rs.start(initial, env0);
      setState(started);
      setPhase(started.finished ? "done" : "reviewing");
    })();
    return () => {
      alive = false;
      audio.cancel();
    };
  }, [audio, tag, includeAll]);

  // Load content for the current card
  const current = state?.current;
  useEffect(() => {
    if (!current) {
      setContent(undefined);
      return;
    }
    setShowHint(false);
    const cached = contentCache.current.get(current.id);
    if (cached) {
      setContent(cached);
      return;
    }
    let alive = true;
    (async () => {
      const bundle = await repo.getBundle(current.entryId);
      if (!bundle || !alive) return;
      const sense = current.senseId ? bundle.senses.find((s) => s.id === current.senseId) : undefined;
      const encounter = bundle.encounters[0];
      const sentence = encounter ? bundle.sentences.find((s) => s.id === encounter.sentenceId) : undefined;
      const c: CardContent = {
        entry: bundle.entry,
        ...(sense ? { sense } : {}),
        allSenses: bundle.senses,
        ...(sentence ? { sentence } : {}),
        ...(encounter ? { encounter } : {}),
      };
      if (current.type === "paradigm" && current.tense) {
        const table = await loadVerbTable();
        const conj = conjugate(table, bundle.entry.lemma, current.tense as TenseId);
        if (conj) c.paradigm = { tense: current.tense, tenseLabel: tenseLabel(current.tense), forms: conj.forms, source: conj.source };
      }
      if (!alive) return;
      contentCache.current.set(current.id, c);
      setContent(c);
    })();
    return () => {
      alive = false;
    };
  }, [current]);

  const applyEffects = useCallback(async (effects: rs.Effects) => {
    if (effects.upsertCards?.length) await repo.putCards(effects.upsertCards);
    if (effects.addLogs?.length) await repo.addLogs(effects.addLogs);
    if (effects.deleteLogIds?.length) await repo.deleteLogs(effects.deleteLogIds);
  }, []);

  const speakBack = useCallback(
    async (c: CardContent) => {
      if (!settings || settings.playback === "display") return;
      const rate = settings.speechRate;
      const parts = spokenBack(c, settings.showVosotros);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, c.paradigm ? 250 : 500));
        await audio.speak(parts[i]!, { rate });
      }
    },
    [audio, settings],
  );

  const doFlip = useCallback(() => {
    if (!state || !state.current || state.flipped) return;
    audio.unlock();
    const next = rs.flip(state);
    setState(next);
    if (content) void speakBack(content);
  }, [state, content, audio, speakBack]);

  const doGrade = useCallback(
    (g: GradeName) => {
      if (!state || !env || !state.flipped) return;
      audio.cancel();
      const r = rs.grade(state, g, env);
      setState(r.state);
      void applyEffects(r.effects);
      if (r.state.finished) setPhase("done");
    },
    [state, env, audio, applyEffects],
  );

  const doUndo = useCallback(async () => {
    if (!state || !env) return;
    audio.cancel();
    const logs = new Map<string, Awaited<ReturnType<typeof repo.getLog>>>();
    const last = state.history[state.history.length - 1];
    if (last) logs.set(last.logId, await repo.getLog(last.logId));
    const r = rs.undo(state, env, (id) => logs.get(id) ?? undefined);
    setState(r.state);
    setPhase("reviewing");
    void applyEffects(r.effects);
  }, [state, env, audio, applyEffects]);

  const doBury = useCallback(() => {
    if (!state || !env || !settings) return;
    audio.cancel();
    const until = dayEnd(new Date(), settings.dayRolloverHour).toISOString();
    const r = rs.bury(state, env, until);
    setState(r.state);
    void applyEffects(r.effects);
    if (r.state.finished) setPhase("done");
  }, [state, env, settings, audio, applyEffects]);

  const doFlag = useCallback(() => {
    if (!state || !env) return;
    const r = rs.toggleFlag(state, env);
    setState(r.state);
    void applyEffects(r.effects);
  }, [state, env, applyEffects]);

  const onSwipe = useCallback(
    (dir: SwipeDir) => {
      doGrade(dir === "right" ? "good" : "again");
    },
    [doGrade],
  );

  const swipe = useSwipe({ enabled: !!state?.flipped, onSwipe, onTap: doFlip });

  if (phase === "loading" || !state || !settings) return <Spinner label="Building session…" />;

  if (phase === "done") {
    return (
      <div className="mx-auto flex flex-1 max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="text-3xl font-semibold">Done for now</div>
        <div className="text-muted">{state.graded} cards reviewed</div>
        <div className="flex gap-3">
          {state.history.length > 0 && <Button onClick={doUndo}>Undo last</Button>}
          <Button variant="primary" onClick={() => nav("/")}>
            Back to Today
          </Button>
        </div>
      </div>
    );
  }

  const { dx, dragging } = swipe.state;
  const tilt = Math.max(-12, Math.min(12, dx / 12));
  const hint = state.flipped ? (dx > 40 ? "good" : dx < -40 ? "again" : undefined) : undefined;
  const hintColor = hint === "good" ? "border-good" : hint === "again" ? "border-again" : "border-transparent";
  const speak = (t: string) => void audio.speak(t, { rate: settings.speechRate });

  return (
    <div className="no-select mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pb-4 pt-2">
      <header className="flex items-center justify-between py-2 text-sm text-muted">
        <button className="px-2 py-1" onClick={() => nav("/")}>
          ✕ Close
        </button>
        <span>
          {tag && <span className="mr-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-accent">{tag}</span>}
          {rs.remaining(state)} left
        </span>
        <div className="flex gap-1">
          <button className="px-2 py-1 disabled:opacity-30" disabled={state.history.length === 0} onClick={doUndo}>
            ↶ Undo
          </button>
        </div>
      </header>

      <div
        className={`relative flex flex-1 touch-none flex-col rounded-3xl border-4 bg-surface p-6 shadow-xl transition-transform ${hintColor} ${dragging ? "" : "duration-200"}`}
        style={{ transform: `translateX(${dx}px) rotate(${tilt}deg)` }}
        {...swipe.handlers}
      >
        {!content ? (
          <Spinner />
        ) : state.flipped ? (
          <CardBack content={content} showVosotros={settings.showVosotros} onSpeak={speak} />
        ) : (
          <CardFront content={content} showHint={showHint} onToggleHint={() => setShowHint((v) => !v)} />
        )}
        {current?.flagged && <span className="absolute right-4 top-4 text-again">⚑</span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        {state.flipped ? (
          <>
            <Button className="flex-1 bg-again/20 text-again" onClick={() => doGrade("again")}>
              Again
            </Button>
            <Button className="flex-1 bg-good/20 text-good" onClick={() => doGrade("good")}>
              Good
            </Button>
          </>
        ) : (
          <Button variant="primary" className="flex-1" onClick={doFlip}>
            Show answer
          </Button>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-6 text-xs text-muted">
        <button className="px-2 py-1" onClick={doFlag}>
          {current?.flagged ? "⚑ Unflag" : "⚑ Flag"}
        </button>
        <button className="px-2 py-1" onClick={doBury}>
          Skip today
        </button>
        {content && (
          <button className="px-2 py-1" onClick={() => void speakBack(content)}>
            🔊 Play
          </button>
        )}
        {content && (
          <button className="px-2 py-1" onClick={() => nav(`/entries/${content.entry.id}`)}>
            ✎ Edit
          </button>
        )}
      </div>
    </div>
  );
}
