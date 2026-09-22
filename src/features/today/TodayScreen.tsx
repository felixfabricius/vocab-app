import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Screen, Spinner } from "@/app/components/ui";
import { repo } from "@/app/services";
import { buildSession } from "@/core/scheduler/session";

interface Counts {
  due: number;
  learning: number;
  fresh: number;
  total: number;
  suggestions: number;
  lookups: number;
  dailyNewLimit: number;
  tags: { tag: string; count: number }[];
}

export function TodayScreen() {
  const nav = useNavigate();
  const [counts, setCounts] = useState<Counts | undefined>();
  const [tag, setTag] = useState<string>("");
  const [includeAll, setIncludeAll] = useState(false);

  const load = useCallback(async () => {
    const [settings, cards, entries, suggestions, lookups, tags] = await Promise.all([
      repo.getSettings(),
      repo.allCards(),
      repo.allActiveEntriesById(),
      repo.countOpenSuggestions(),
      repo.countUnconsumedLookups(),
      repo.allTags(),
    ]);
    const s = buildSession({ cards, entriesById: entries, settings, now: new Date() });
    setCounts({
      due: s.due.length,
      learning: s.learning.length,
      fresh: s.fresh.length,
      total: entries.size,
      suggestions,
      lookups,
      dailyNewLimit: settings.dailyNewLimit,
      tags,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function adjustLimit(delta: number) {
    if (!counts) return;
    const next = Math.max(0, counts.dailyNewLimit + delta);
    await repo.saveSettings({ dailyNewLimit: next });
    await load();
  }

  if (!counts) return <Spinner />;
  const todayTotal = counts.due + counts.learning + counts.fresh;
  const chosenTag = tag || counts.tags[0]?.tag || "";

  return (
    <Screen title="Today">
      <Card className="mb-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Due" value={counts.due} color="text-accent" />
          <Stat label="Learning" value={counts.learning} color="text-easy" />
          <Stat label="New" value={counts.fresh} color="text-good" />
        </div>
        <Button variant="primary" className="w-full text-lg" disabled={todayTotal === 0} onClick={() => nav("/review")}>
          {todayTotal === 0 ? "Nothing due" : `Review ${todayTotal} cards`}
        </Button>
        <div className="mt-3 flex items-center justify-between text-sm text-muted">
          <span>New cards per day</span>
          <span className="flex items-center gap-2">
            <button className="h-8 w-8 rounded-lg bg-surface-2 text-lg leading-none" onClick={() => void adjustLimit(-5)} aria-label="fewer">
              −
            </button>
            <span className="w-8 text-center text-text">{counts.dailyNewLimit}</span>
            <button className="h-8 w-8 rounded-lg bg-surface-2 text-lg leading-none" onClick={() => void adjustLimit(5)} aria-label="more">
              +
            </button>
          </span>
        </div>
      </Card>

      {counts.tags.length > 0 && (
        <Card className="mb-4">
          <div className="mb-2 font-medium">Study by tag</div>
          <div className="flex gap-2">
            <select className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2 py-2" value={chosenTag} onChange={(e) => setTag(e.target.value)}>
              {counts.tags.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={!chosenTag} onClick={() => nav(`/review?tag=${encodeURIComponent(chosenTag)}${includeAll ? "&all=1" : ""}`)}>
              Start
            </Button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
            Include everything (also cards not due yet)
          </label>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Cards to create</div>
            <div className="text-sm text-muted">
              {counts.suggestions === 0 && counts.lookups === 0
                ? "Inbox is empty"
                : [counts.suggestions ? `${counts.suggestions} drafts waiting` : "", counts.lookups ? `${counts.lookups} lookups` : ""].filter(Boolean).join(" · ")}
            </div>
          </div>
          <Button onClick={() => nav("/import")}>Import</Button>
        </div>
      </Card>

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Grammar</div>
            <div className="text-sm text-muted">Activate tenses, conjugation cards</div>
          </div>
          <Button onClick={() => nav("/grammar")}>Open</Button>
        </div>
      </Card>

      <p className="text-center text-sm text-muted">
        {counts.total} entries in your collection ·{" "}
        <button className="underline" onClick={() => nav("/stats")}>
          stats
        </button>
      </p>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className={`text-3xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
