import { useEffect, useState } from "react";
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
}

export function TodayScreen() {
  const nav = useNavigate();
  const [counts, setCounts] = useState<Counts | undefined>();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [settings, cards, entries, suggestions] = await Promise.all([
        repo.getSettings(),
        repo.allCards(),
        repo.allActiveEntriesById(),
        repo.countOpenSuggestions(),
      ]);
      const s = buildSession({ cards, entriesById: entries, settings, now: new Date() });
      if (alive) {
        setCounts({
          due: s.due.length,
          learning: s.learning.length,
          fresh: s.fresh.length,
          total: entries.size,
          suggestions,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!counts) return <Spinner />;
  const todayTotal = counts.due + counts.learning + counts.fresh;

  return (
    <Screen title="Today">
      <Card className="mb-4">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Due" value={counts.due} color="text-accent" />
          <Stat label="Learning" value={counts.learning} color="text-easy" />
          <Stat label="New" value={counts.fresh} color="text-good" />
        </div>
        <Button
          variant="primary"
          className="w-full text-lg"
          disabled={todayTotal === 0}
          onClick={() => nav("/review")}
        >
          {todayTotal === 0 ? "Nothing due" : `Review ${todayTotal} cards`}
        </Button>
      </Card>

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Suggestions</div>
            <div className="text-sm text-muted">
              {counts.suggestions === 0 ? "Inbox is empty" : `${counts.suggestions} waiting`}
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

      <p className="text-center text-sm text-muted">{counts.total} entries in your collection</p>
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
