/** Loads the bundled token -> rank table once; used to set default priorities. */
import { LANGUAGE } from "@/config/language";

let table: Map<string, number> | undefined;
let loading: Promise<Map<string, number>> | undefined;

export async function loadFrequency(fetcher: () => Promise<Record<string, number>> = defaultFetch): Promise<Map<string, number>> {
  if (table) return table;
  if (!loading) {
    loading = fetcher()
      .then((r) => (table = new Map(Object.entries(r))))
      .catch(() => (table = new Map()));
  }
  return loading;
}

async function defaultFetch(): Promise<Record<string, number>> {
  const res = await fetch(LANGUAGE.frequencyPath);
  if (!res.ok) throw new Error(`frequency table ${res.status}`);
  const data = (await res.json()) as { rank: Record<string, number> };
  return data.rank;
}

export function setFrequencyTable(t: Map<string, number> | undefined) {
  table = t;
  loading = undefined;
}
