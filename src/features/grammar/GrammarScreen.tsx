import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Row, Screen, Spinner } from "@/app/components/ui";
import { repo } from "@/app/services";
import { useSettings } from "@/app/useSettings";
import { LANGUAGE } from "@/config/language";
import type { Card as CardRow, TensePlanRow } from "@/core/types";
import { setTenseActive } from "./tenseService";
import { getTensePlan } from "./tenseService";

export function GrammarScreen() {
  const nav = useNavigate();
  const { settings, update } = useSettings();
  const [plan, setPlan] = useState<TensePlanRow[] | undefined>();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [busy, setBusy] = useState<string | undefined>();
  const [msg, setMsg] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([getTensePlan(repo), repo.allCards()]);
    setPlan(p);
    setCards(c.filter((x) => x.type === "paradigm"));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!plan || !settings) return <Spinner />;

  async function toggle(row: TensePlanRow) {
    const active = row.status !== "active";
    setBusy(row.tense);
    try {
      const r = await setTenseActive(repo, row.tense, active);
      setMsg(active ? `${labelOf(row.tense)} activated: ${r.created} new cards, ${r.toggled} reactivated` : `${labelOf(row.tense)} paused: ${r.toggled} cards suspended`);
      await load();
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <Screen
      title="Grammar"
      right={
        <button className="text-sm text-muted" onClick={() => nav(-1)}>
          Back
        </button>
      }
    >
      {msg && <div className="mb-3 rounded-xl bg-surface-2 p-3 text-sm">{msg}</div>}
      <Card className="mb-4">
        <h2 className="mb-1 font-medium">Tenses</h2>
        <p className="mb-3 text-sm text-muted">
          Activate tenses one at a time. Irregular Essential and Core verbs get one paradigm card per active tense; regular verbs are covered by the model verbs hablar, comer and vivir.
        </p>
        <ul className="divide-y divide-surface-2">
          {plan.map((row) => {
            const n = cards.filter((c) => c.tense === row.tense).length;
            const active = row.status === "active";
            return (
              <li key={row.tense} className="flex items-center justify-between py-3">
                <div>
                  <div className={active ? "font-medium" : "text-muted"}>{labelOf(row.tense)}</div>
                  <div className="text-xs text-muted">{n} cards</div>
                </div>
                <Button variant={active ? "secondary" : "primary"} disabled={busy === row.tense} onClick={() => void toggle(row)}>
                  {busy === row.tense ? "…" : active ? "Pause" : "Activate"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 font-medium">Display</h2>
        <Row label="Show vosotros row">
          <input type="checkbox" className="h-5 w-5" checked={settings.showVosotros} onChange={(e) => void update({ showVosotros: e.target.checked })} />
        </Row>
        <p className="text-xs text-muted">Not used in Chile; shown with a “Spain” tag.</p>
      </Card>
    </Screen>
  );
}

function labelOf(id: string): string {
  return LANGUAGE.tensePlan.find((t) => t.id === id)?.label ?? id;
}
