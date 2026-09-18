import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card, Row, Screen, Spinner } from "@/app/components/ui";
import { repo } from "@/app/services";
import { dayKey } from "@/core/scheduler/day";
import { PRIORITIES, type Priority } from "@/core/types";

interface Stats {
  days: { day: string; reviews: number; correct: number }[];
  byState: [number, number, number, number];
  byClass: Record<Priority, number>;
  retention7: number | undefined;
  suspended: number;
  flagged: number;
  entries: number;
}

export function StatsScreen() {
  const nav = useNavigate();
  const [s, setS] = useState<Stats | undefined>();

  useEffect(() => {
    (async () => {
      const [settings, cards, entries] = await Promise.all([repo.getSettings(), repo.allCards(), repo.allActiveEntriesById()]);
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const logs = await repo.logsSince(since);
      const byDay = new Map<string, { reviews: number; correct: number }>();
      for (let i = 13; i >= 0; i--) byDay.set(dayKey(new Date(Date.now() - i * 86_400_000), settings.dayRolloverHour), { reviews: 0, correct: 0 });
      for (const l of logs) {
        const k = dayKey(new Date(l.reviewedAt), settings.dayRolloverHour);
        const d = byDay.get(k);
        if (!d) continue;
        d.reviews++;
        if (l.rating >= 3) d.correct++;
      }
      const last7 = [...byDay.entries()].slice(-7).map(([, v]) => v);
      const r7 = last7.reduce((a, v) => a + v.reviews, 0);
      const c7 = last7.reduce((a, v) => a + v.correct, 0);
      const byState: [number, number, number, number] = [0, 0, 0, 0];
      const byClass: Record<Priority, number> = { essential: 0, core: 0, standard: 0, niche: 0 };
      let suspended = 0;
      let flagged = 0;
      for (const c of cards) {
        if (c.status === "suspended") suspended++;
        if (c.flagged) flagged++;
        byState[c.fsrs.state]++;
      }
      for (const e of entries.values()) byClass[e.priority]++;
      setS({
        days: [...byDay.entries()].map(([day, v]) => ({ day, ...v })),
        byState,
        byClass,
        retention7: r7 ? c7 / r7 : undefined,
        suspended,
        flagged,
        entries: entries.size,
      });
    })();
  }, []);

  if (!s) return <Spinner />;
  const max = Math.max(1, ...s.days.map((d) => d.reviews));

  return (
    <Screen
      title="Stats"
      right={
        <button className="text-sm text-muted" onClick={() => nav(-1)}>
          Back
        </button>
      }
    >
      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Reviews, last 14 days</h2>
        <div className="flex h-24 items-end gap-1">
          {s.days.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${d.day}: ${d.reviews}`}>
              <div className="w-full rounded-t bg-accent/70" style={{ height: `${(d.reviews / max) * 100}%`, minHeight: d.reviews ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <Row label="Retention, last 7 days">
          <span>{s.retention7 === undefined ? "—" : `${Math.round(s.retention7 * 100)}%`}</span>
        </Row>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-medium">Cards</h2>
        <Row label="New"><span>{s.byState[0]}</span></Row>
        <Row label="Learning"><span>{s.byState[1] + s.byState[3]}</span></Row>
        <Row label="Review"><span>{s.byState[2]}</span></Row>
        <Row label="Suspended"><span>{s.suspended}</span></Row>
        <Row label="Flagged"><span>{s.flagged}</span></Row>
      </Card>

      <Card>
        <h2 className="mb-2 font-medium">Entries by class ({s.entries})</h2>
        {PRIORITIES.map((p) => (
          <Row key={p} label={p}>
            <span>{s.byClass[p]}</span>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
