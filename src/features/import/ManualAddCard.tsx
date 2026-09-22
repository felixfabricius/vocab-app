import { useState } from "react";
import { Button, Card } from "@/app/components/ui";
import { looksSpanish } from "@/core/import/language";
import type { EntryDraft } from "@/core/types";

/**
 * Manual add (SPEC-NATIVE §4a): one field that takes Spanish or English, an
 * optional other side, an optional tag. "Complete with AI" drafts the rest;
 * without a key, both sides are required and saved as typed.
 */
export function ManualAddCard({ hasKey, busy, tag, onAi, onSave }: {
  hasKey: boolean;
  busy: boolean;
  tag: string;
  onAi: (input: string, tag: string) => void;
  onSave: (draft: EntryDraft, tag: string) => void;
}) {
  const [text, setText] = useState("");
  const [other, setOther] = useState("");
  const [ownTag, setOwnTag] = useState("");
  const effectiveTag = ownTag.trim() || tag;
  const field = "w-full rounded-xl bg-surface-2 px-3 py-2";

  function save() {
    const a = text.trim();
    const b = other.trim();
    if (!a || !b) return;
    const aSpanish = looksSpanish(a) || !looksSpanish(b);
    const es = aSpanish ? a : b;
    const en = aSpanish ? b : a;
    const words = es.split(/\s+/).length;
    onSave(
      { lemma: es, pos: words > 1 ? "phrase" : "other", isPhrase: words > 1, senses: [{ gloss: en }], priority: "standard", regional: "neutral", fromSentence: [] },
      effectiveTag,
    );
    setText("");
    setOther("");
  }

  function ai() {
    const a = text.trim();
    if (!a) return;
    onAi(other.trim() ? `${a} = ${other.trim()}` : a, effectiveTag);
    setText("");
    setOther("");
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-2 font-medium">Add a word or phrase</h2>
      <input className={`${field} mb-2`} placeholder="Spanish or English" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (hasKey ? ai() : save())} />
      <input className={`${field} mb-2`} placeholder={hasKey ? "Translation (optional)" : "Translation (required without an API key)"} value={other} onChange={(e) => setOther(e.target.value)} />
      <input className={`${field} mb-3 text-sm`} placeholder={tag ? `Tag (default: ${tag})` : "Tag (optional)"} value={ownTag} onChange={(e) => setOwnTag(e.target.value)} />
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !text.trim() || !other.trim()} onClick={save}>
          Save as typed
        </Button>
        <Button variant="primary" className="flex-1" disabled={busy || !hasKey || !text.trim()} onClick={ai}>
          Complete with AI
        </Button>
      </div>
    </Card>
  );
}
