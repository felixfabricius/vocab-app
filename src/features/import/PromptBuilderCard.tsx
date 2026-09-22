import { useState } from "react";
import { Button, Card } from "@/app/components/ui";
import type { BuilderContext, BuiltPrompt } from "@/llm/prompts/builders";
import { bookPrompt, contextPrompt, seriesPrompt, textbookPrompt } from "@/llm/prompts/builders";
import type { Density, PhrasePreference } from "@/llm/prompts/extract";

type Kind = "series" | "textbook" | "book" | "context";
const KINDS: { id: Kind; label: string }[] = [
  { id: "series", label: "Series" },
  { id: "textbook", label: "Textbook" },
  { id: "book", label: "Book" },
  { id: "context", label: "Context" },
];

/**
 * The Claude-app path: pick a builder, fill its fields, copy the prompt, send it
 * with the photo or subtitle text in the Claude app, paste the reply below.
 */
export function PromptBuilderCard({ getContext, onCopied, paste, setPaste, onImport, busy, importedTag }: {
  getContext: () => Promise<BuilderContext>;
  onCopied: (built: BuiltPrompt) => void;
  paste: string;
  setPaste: (v: string) => void;
  onImport: () => void;
  busy: boolean;
  importedTag?: string;
}) {
  const [kind, setKind] = useState<Kind>("textbook");
  const [series, setSeries] = useState("");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [book, setBook] = useState("");
  const [page, setPage] = useState("");
  const [tag, setTag] = useState("");
  const [count, setCount] = useState("40");
  const [phrases, setPhrases] = useState<PhrasePreference>("balanced");
  const [density, setDensity] = useState<Density>("unknown");
  const [situation, setSituation] = useState("");
  const [msg, setMsg] = useState<string | undefined>();
  const field = "w-full rounded-xl bg-surface-2 px-3 py-2 text-sm";

  function build(ctx: BuilderContext): BuiltPrompt | undefined {
    const n = Number(count) || undefined;
    const t = tag.trim() || undefined;
    switch (kind) {
      case "series":
        return series.trim() ? seriesPrompt(ctx, { series, season, episode, tag: t, targetCount: n, phrasePreference: phrases }) : undefined;
      case "textbook":
        return book.trim() ? textbookPrompt(ctx, { book, page, tag: t }) : undefined;
      case "book":
        return book.trim() ? bookPrompt(ctx, { book, tag: t, density }) : undefined;
      case "context":
        return situation.trim() ? contextPrompt(ctx, { situation, tag: t, targetCount: n }) : undefined;
    }
  }

  async function copy() {
    const built = build(await getContext());
    if (!built) {
      setMsg("Fill in the first field.");
      return;
    }
    try {
      await navigator.clipboard.writeText(built.prompt);
      setMsg(`Prompt copied (tag “${built.tag}”). Paste it into the Claude app with the ${kind === "series" ? "subtitle text" : kind === "context" ? "situation" : "photo"}, then paste the reply below.`);
    } catch {
      setMsg("Clipboard blocked; the prompt is in the box below, long-press to copy it.");
      setPaste(built.prompt);
    }
    onCopied(built);
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-2 font-medium">Via the Claude app</h2>
      <div className="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1">
        {KINDS.map((k) => (
          <button key={k.id} className={`flex-1 rounded-lg py-1.5 text-sm ${kind === k.id ? "bg-surface text-text" : "text-muted"}`} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {kind === "series" && (
        <div className="space-y-2">
          <input className={field} placeholder="Series" value={series} onChange={(e) => setSeries(e.target.value)} />
          <div className="flex gap-2">
            <input className={field} placeholder="Season" inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} />
            <input className={field} placeholder="Episode" inputMode="numeric" value={episode} onChange={(e) => setEpisode(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <input className={field} placeholder="Target count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            <select className={field} value={phrases} onChange={(e) => setPhrases(e.target.value as PhrasePreference)}>
              <option value="few">few phrases</option>
              <option value="balanced">balanced</option>
              <option value="many">many phrases</option>
            </select>
          </div>
        </div>
      )}
      {kind === "textbook" && (
        <div className="flex gap-2">
          <input className={field} placeholder="Book" value={book} onChange={(e) => setBook(e.target.value)} />
          <input className={`${field} w-24 flex-none`} placeholder="Page" value={page} onChange={(e) => setPage(e.target.value)} />
        </div>
      )}
      {kind === "book" && (
        <div className="space-y-2">
          <input className={field} placeholder="Book" value={book} onChange={(e) => setBook(e.target.value)} />
          <select className={field} value={density} onChange={(e) => setDensity(e.target.value as Density)}>
            <option value="unknown">unknown-looking words</option>
            <option value="content">all content words</option>
            <option value="all">everything</option>
          </select>
        </div>
      )}
      {kind === "context" && (
        <div className="space-y-2">
          <textarea className={`${field} h-20`} placeholder="Situation, e.g. renting a flat in Santiago" value={situation} onChange={(e) => setSituation(e.target.value)} />
          <input className={field} placeholder="Target count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
      )}
      <input className={`${field} mt-2`} placeholder="Tag (optional; default from the fields above)" value={tag} onChange={(e) => setTag(e.target.value)} />

      <Button className="mt-3 w-full" onClick={() => void copy()}>
        Copy prompt
      </Button>
      {msg && <div className="mt-2 rounded-lg bg-surface-2 p-2 text-xs">{msg}</div>}

      <textarea className="mt-3 h-32 w-full rounded-xl bg-surface-2 p-3 text-sm" placeholder="Paste the reply here (also accepts plain lines: spanish ⇥ english)" value={paste} onChange={(e) => setPaste(e.target.value)} />
      {importedTag && <div className="mt-1 text-xs text-muted">Tag in the pasted block: {importedTag}</div>}
      <Button variant="primary" className="mt-2 w-full" disabled={!paste.trim() || busy} onClick={onImport}>
        Import pasted text
      </Button>
    </Card>
  );
}
