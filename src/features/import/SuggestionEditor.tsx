import { useState } from "react";
import { Button } from "@/app/components/ui";
import type { EntryDraft, Pos, Priority, Regional } from "@/core/types";

const POS: Pos[] = ["noun", "verb", "adj", "adv", "phrase", "prep", "conj", "pron", "interj", "num", "other"];
const PRIORITIES: Priority[] = ["essential", "core", "standard", "niche"];

export function SuggestionEditor({ draft, onSave, onCancel }: { draft: EntryDraft; onSave: (d: EntryDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<EntryDraft>(structuredClone(draft));
  const set = (patch: Partial<EntryDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const field = "w-full rounded-lg bg-surface-2 px-3 py-2 text-base";

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onCancel}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-bg p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">Edit suggestion</h2>
        <label className="mb-2 block text-xs text-muted">Lemma</label>
        <input className={field} value={d.lemma} onChange={(e) => set({ lemma: e.target.value })} />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Part of speech</label>
            <select className={field} value={d.pos} onChange={(e) => set({ pos: e.target.value as Pos, isPhrase: e.target.value === "phrase" })}>
              {POS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Priority</label>
            <select className={field} value={d.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {d.pos === "noun" && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Gender</label>
              <select className={field} value={d.gender ?? ""} onChange={(e) => set({ gender: (e.target.value || undefined) as "m" | "f" | undefined })}>
                <option value="">—</option>
                <option value="m">m</option>
                <option value="f">f</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Article</label>
              <input className={field} value={d.article ?? ""} onChange={(e) => set({ article: e.target.value || undefined })} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Plural</label>
              <input className={field} value={d.plural ?? ""} onChange={(e) => set({ plural: e.target.value || undefined })} />
            </div>
          </div>
        )}

        <label className="mb-1 mt-3 block text-xs text-muted">Meanings (one per line)</label>
        <textarea
          className={`${field} h-20`}
          value={d.senses.map((s) => s.gloss).join("\n")}
          onChange={(e) => set({ senses: e.target.value.split("\n").filter((x) => x.trim()).map((gloss) => ({ gloss: gloss.trim() })) })}
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Regional</label>
            <select className={field} value={d.regional} onChange={(e) => set({ regional: e.target.value as Regional })}>
              <option value="neutral">neutral</option>
              <option value="chile">chileno</option>
            </select>
          </div>
          {d.pos === "verb" && (
            <div>
              <label className="mb-1 block text-xs text-muted">Irregular</label>
              <select className={field} value={d.verb?.irregular ? "yes" : "no"} onChange={(e) => set({ verb: { irregular: e.target.value === "yes" } })}>
                <option value="no">no</option>
                <option value="yes">yes</option>
              </select>
            </div>
          )}
        </div>

        <label className="mb-1 mt-3 block text-xs text-muted">Note</label>
        <input className={field} value={d.note ?? ""} onChange={(e) => set({ note: e.target.value || undefined })} />

        {d.generatedSentence && (
          <>
            <label className="mb-1 mt-3 block text-xs text-muted">Example sentence</label>
            <input className={field} value={d.generatedSentence.es} onChange={(e) => set({ generatedSentence: { ...d.generatedSentence!, es: e.target.value, span: undefined } })} />
            <input className={`${field} mt-1`} value={d.generatedSentence.en} onChange={(e) => set({ generatedSentence: { ...d.generatedSentence!, en: e.target.value } })} />
          </>
        )}
        {d.sourceSentence && (
          <>
            <label className="mb-1 mt-3 block text-xs text-muted">Source sentence</label>
            <input className={field} value={d.sourceSentence.es} onChange={(e) => set({ sourceSentence: { ...d.sourceSentence!, es: e.target.value, span: undefined } })} />
            <input className={`${field} mt-1`} value={d.sourceSentence.en} onChange={(e) => set({ sourceSentence: { ...d.sourceSentence!, en: e.target.value } })} />
          </>
        )}

        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" className="flex-1" disabled={!d.lemma.trim() || d.senses.length === 0} onClick={() => onSave(d)}>Save</Button>
        </div>
      </div>
    </div>
  );
}
