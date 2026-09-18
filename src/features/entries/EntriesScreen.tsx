import { useEffect, useState } from "react";
import { Screen, Spinner } from "@/app/components/ui";
import { repo } from "@/app/services";
import type { Entry } from "@/core/types";

export function EntriesScreen() {
  const [rows, setRows] = useState<Entry[] | undefined>();
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    repo.listEntries({ status: "active", search, limit: 300 }).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [search]);

  return (
    <Screen title="Words">
      <input
        className="mb-3 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none placeholder:text-muted"
        placeholder="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="p-4 text-center text-muted">No entries yet.</p>
      ) : (
        <ul className="divide-y divide-surface-2 rounded-2xl bg-surface">
          {rows.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{e.lemma}</div>
                <div className="text-xs text-muted">
                  {e.pos}
                  {e.regional === "chile" ? " · chileno" : ""}
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${priorityClass(e.priority)}`}>{e.priority}</span>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

export function priorityClass(p: Entry["priority"]): string {
  switch (p) {
    case "essential":
      return "bg-accent/20 text-accent";
    case "core":
      return "bg-good/20 text-good";
    case "standard":
      return "bg-surface-2 text-text";
    default:
      return "bg-surface-2 text-muted";
  }
}
