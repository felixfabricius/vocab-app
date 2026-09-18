import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, Card, Row, Screen, Spinner } from "@/app/components/ui";
import { getAudio, repo } from "@/app/services";
import { newId, nowIso } from "@/core/ids";
import { missingProductionCards } from "@/core/generator/cards";
import type { Entry, Pos, Priority, Regional, Sense } from "@/core/types";
import type { EntryBundle } from "@/storage/Repository";
import { HighlightedSentence } from "@/features/review/CardView";

const POS: Pos[] = ["noun", "verb", "adj", "adv", "phrase", "prep", "conj", "pron", "interj", "num", "other"];
const PRIORITIES: Priority[] = ["essential", "core", "standard", "niche"];
const STATE_LABEL = ["new", "learning", "review", "relearning"] as const;

export function EntryScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const [bundle, setBundle] = useState<EntryBundle | undefined>();
  const audio = getAudio();

  const load = useCallback(async () => {
    if (id) setBundle(await repo.getBundle(id));
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;
  if (!bundle) return <Spinner />;
  const { entry, senses, cards, encounters, sentences } = bundle;
  const field = "w-full rounded-lg bg-surface-2 px-3 py-2 text-base";

  async function patch(p: Partial<Entry>) {
    const next: Entry = { ...entry, ...p, updatedAt: nowIso() };
    if ("priority" in p) next.priorityAuto = false;
    await repo.putEntry(next);
    setBundle((b) => (b ? { ...b, entry: next } : b));
  }

  async function saveSenses(glosses: string[]) {
    const at = nowIso();
    const kept: Sense[] = [];
    glosses.forEach((gloss, order) => {
      const existing = senses[order];
      kept.push(existing ? { ...existing, gloss, order, updatedAt: at } : { id: newId(), entryId: entry.id, gloss, order, createdAt: at, updatedAt: at });
    });
    for (const s of senses.slice(glosses.length)) {
      await repo.deleteSense(s.id);
      await repo.deleteCards(cards.filter((c) => c.senseId === s.id).map((c) => c.id));
    }
    await repo.putSenses(kept);
    const added = missingProductionCards(entry, kept, cards, { now: () => new Date(), newId });
    if (added.length) await repo.putCards(added);
    await load();
  }

  async function setSuspended(suspended: boolean) {
    await patch({ status: suspended ? "suspended" : "active" });
    const at = nowIso();
    await repo.putCards(cards.map((c) => ({ ...c, status: suspended ? "suspended" : "active", updatedAt: at })));
    await load();
  }

  async function resetProgress() {
    if (!window.confirm("Reset learning progress for this entry?")) return;
    const { newFsrsState } = await import("@/core/scheduler/fsrs");
    const at = nowIso();
    await repo.putCards(cards.map((c) => ({ ...c, fsrs: newFsrsState(new Date()), introducedOn: undefined, updatedAt: at })));
    await load();
  }

  async function trash() {
    if (!window.confirm(`Move "${entry.lemma}" to the trash? It is kept for 30 days.`)) return;
    await repo.trashEntry(entry.id, nowIso());
    nav("/entries");
  }

  return (
    <Screen
      title={entry.lemma}
      right={
        <button className="text-sm text-muted" onClick={() => nav(-1)}>
          Back
        </button>
      }
    >
      <Card className="mb-4">
        <label className="mb-1 block text-xs text-muted">Lemma</label>
        <div className="flex gap-2">
          <input className={field} defaultValue={entry.lemma} onBlur={(e) => e.target.value.trim() && e.target.value !== entry.lemma && void patch({ lemma: e.target.value.trim() })} />
          <Button onClick={() => void audio.speak(entry.lemma)}>🔊</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Part of speech</label>
            <select className={field} value={entry.pos} onChange={(e) => void patch({ pos: e.target.value as Pos, isPhrase: e.target.value === "phrase" })}>
              {POS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Priority</label>
            <select className={field} value={entry.priority} onChange={(e) => void patch({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        {entry.pos === "noun" && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Gender</label>
              <select className={field} value={entry.gender ?? ""} onChange={(e) => void patch({ gender: (e.target.value || undefined) as "m" | "f" | undefined })}>
                <option value="">—</option>
                <option value="m">m</option>
                <option value="f">f</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Article</label>
              <input className={field} defaultValue={entry.article ?? ""} onBlur={(e) => void patch({ article: e.target.value || undefined })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Plural</label>
              <input className={field} defaultValue={entry.plural ?? ""} onBlur={(e) => void patch({ plural: e.target.value || undefined })} />
            </div>
          </div>
        )}
        <label className="mb-1 mt-3 block text-xs text-muted">Meanings (one per line)</label>
        <textarea
          className={`${field} h-20`}
          defaultValue={senses.map((s) => s.gloss).join("\n")}
          onBlur={(e) => {
            const glosses = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
            if (glosses.length && glosses.join("\n") !== senses.map((s) => s.gloss).join("\n")) void saveSenses(glosses);
          }}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Regional</label>
            <select className={field} value={entry.regional} onChange={(e) => void patch({ regional: e.target.value as Regional })}>
              <option value="neutral">neutral</option>
              <option value="chile">chileno</option>
            </select>
          </div>
          {entry.pos === "verb" && (
            <div>
              <label className="mb-1 block text-xs text-muted">Irregular</label>
              <select
                className={field}
                value={entry.verb?.irregular ? "yes" : "no"}
                onChange={(e) => void patch({ verb: { irregular: e.target.value === "yes", paradigmCards: entry.verb?.paradigmCards ?? "auto" } })}
              >
                <option value="no">no</option>
                <option value="yes">yes</option>
              </select>
            </div>
          )}
        </div>
        <label className="mb-1 mt-3 block text-xs text-muted">Note</label>
        <textarea className={`${field} h-16`} defaultValue={entry.note ?? ""} onBlur={(e) => void patch({ note: e.target.value.trim() || undefined })} />
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Sentences</h2>
        {encounters.length === 0 && <p className="text-sm text-muted">None yet.</p>}
        <ul className="space-y-3">
          {encounters.map((enc) => {
            const s = sentences.find((x) => x.id === enc.sentenceId);
            if (!s) return null;
            return (
              <li key={enc.id} className="rounded-lg bg-surface-2 p-3" onClick={() => void audio.speak(s.es)}>
                <div>
                  <HighlightedSentence sentence={s.es} span={enc.span} />
                </div>
                <div className="text-sm text-muted">{s.en}</div>
                <div className="mt-1 text-[10px] uppercase text-muted/70">{s.origin}{enc.tense ? ` · ${enc.tense}` : ""}</div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Cards</h2>
        {cards.map((c) => (
          <Row key={c.id} label={`${c.type}${c.tense ? ` · ${c.tense}` : ""}${c.senseId ? ` · ${senses.find((s) => s.id === c.senseId)?.gloss ?? ""}` : ""}`}>
            <span className="text-sm text-muted">
              {STATE_LABEL[c.fsrs.state]} · due {new Date(c.fsrs.due).toLocaleDateString()} · {c.fsrs.reps} reps
              {c.status !== "active" ? ` · ${c.status}` : ""}
            </span>
          </Row>
        ))}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={() => void setSuspended(entry.status !== "suspended")}>{entry.status === "suspended" ? "Unsuspend" : "Suspend"}</Button>
          <Button onClick={() => void resetProgress()}>Reset progress</Button>
          <Button variant="danger" onClick={() => void trash()}>Trash</Button>
        </div>
      </Card>

      <p className="text-center text-xs text-muted">
        {entry.tags.join(", ")} {entry.frequencyRank ? `· rank ${entry.frequencyRank}` : ""} · created {new Date(entry.createdAt).toLocaleDateString()}
      </p>
    </Screen>
  );
}
