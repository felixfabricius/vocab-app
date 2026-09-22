import type { ReactNode } from "react";
import { LANGUAGE } from "@/config/language";
import type { Encounter, Entry, Sense, Sentence } from "@/core/types";
import type { Forms } from "@/core/verbs";

export interface ParadigmContent {
  tense: string;
  tenseLabel: string;
  forms: Forms;
  source: "table" | "regular";
}

export interface CardContent {
  entry: Entry;
  sense?: Sense;
  allSenses: Sense[];
  sentence?: Sentence;
  encounter?: Encounter;
  paradigm?: ParadigmContent;
}

/** Highlight the encounter span inside the Spanish sentence. */
export function HighlightedSentence({ sentence, span }: { sentence: string; span?: [number, number] }) {
  if (!span) return <>{sentence}</>;
  const [a, b] = span;
  return (
    <>
      {sentence.slice(0, a)}
      <mark className="rounded bg-accent/25 px-0.5 text-text">{sentence.slice(a, b)}</mark>
      {sentence.slice(b)}
    </>
  );
}

function PosTag({ entry }: { entry: Entry }) {
  const bits: string[] = [];
  if (entry.isPhrase) bits.push("phrase");
  else bits.push(entry.pos);
  if (entry.regional === "chile") bits.push("chileno"); // VARIETY
  return <span className="text-xs uppercase tracking-wide text-muted">{bits.join(" · ")}</span>;
}

export function CardFront({ content, showHint, onToggleHint }: { content: CardContent; showHint: boolean; onToggleHint: () => void }) {
  if (content.paradigm) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <span className="text-xs uppercase tracking-wide text-muted">conjugation</span>
        <div className="text-4xl font-semibold">{content.entry.lemma}</div>
        {content.allSenses.length > 0 && (
          <div className="text-sm text-muted">{content.allSenses.map((s) => s.gloss).join(" · ")}</div>
        )}
        <div className="text-xl text-accent">{content.paradigm.tenseLabel}</div>
        <div className="mt-2 text-sm text-muted">recite every person, then reveal</div>
        <div className="absolute bottom-6 text-xs text-muted">tap to reveal</div>
      </div>
    );
  }
  const gloss = content.sense ? content.sense.gloss : content.allSenses.map((s) => s.gloss).join("; ");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <PosTag entry={content.entry} />
      <div className="text-3xl font-semibold leading-snug">{gloss}</div>
      {content.sentence && (
        <button
          className="mt-2 text-sm text-muted underline decoration-dotted"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHint();
          }}
        >
          {showHint ? content.sentence.en : "context"}
        </button>
      )}
      <div className="absolute bottom-6 text-xs text-muted">tap to reveal</div>
    </div>
  );
}

export function ParadigmTable({ forms, showVosotros, onSpeak }: { forms: Forms; showVosotros: boolean; onSpeak?: (text: string) => void }) {
  return (
    <table className="w-full max-w-xs text-left">
      <tbody>
        {LANGUAGE.persons.map((p, i) => {
          const form = forms[i];
          if (!form) return null;
          if (p.regionalNote && !showVosotros) return null;
          return (
            <tr key={p.id} className={p.regionalNote ? "text-muted" : ""} onClick={() => onSpeak?.(form)}>
              <td className="py-1 pr-3 text-sm text-muted">
                {p.label}
                {p.regionalNote && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px]">{p.regionalNote}</span>}
              </td>
              <td className="py-1 text-lg font-medium">{form}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CardBack({ content, showVosotros, onSpeak }: { content: CardContent; showVosotros: boolean; onSpeak: (text: string) => void }) {
  const { entry, sentence, encounter } = content;
  if (content.paradigm) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="text-2xl font-semibold">
          {entry.lemma} <span className="text-base text-accent">· {content.paradigm.tenseLabel}</span>
        </div>
        {content.allSenses.length > 0 && (
          <div className="text-sm text-muted">{content.allSenses.map((s) => s.gloss).join(" · ")}</div>
        )}
        <ParadigmTable forms={content.paradigm.forms} showVosotros={showVosotros} onSpeak={onSpeak} />
        {content.paradigm.source === "regular" && <div className="text-xs text-muted">regular pattern</div>}
      </div>
    );
  }
  const head = entry.pos === "noun" && entry.article ? `${entry.article} ${entry.lemma}` : entry.lemma;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <PosTag entry={entry} />
      <Speakable onSpeak={() => onSpeak(entry.lemma)}>
        <div className="text-4xl font-semibold leading-snug">{head}</div>
      </Speakable>
      {entry.plural && <div className="text-sm text-muted">pl. {entry.plural}</div>}
      {content.allSenses.length > 1 && (
        <div className="text-sm text-muted">{content.allSenses.map((s) => s.gloss).join(" · ")}</div>
      )}
      {sentence && (
        <Speakable onSpeak={() => onSpeak(sentence.es)}>
          <div className="mt-2 text-lg leading-relaxed">
            <HighlightedSentence sentence={sentence.es} span={encounter?.span} />
          </div>
          <div className="text-sm text-muted">{sentence.en}</div>
        </Speakable>
      )}
      {entry.note && <div className="mt-2 max-w-xs text-sm text-muted">{entry.note}</div>}
    </div>
  );
}

function Speakable({ children, onSpeak }: { children: ReactNode; onSpeak: () => void }) {
  return (
    <div
      role="button"
      className="rounded-lg px-2 active:bg-surface-2"
      onClick={(e) => {
        e.stopPropagation();
        onSpeak();
      }}
    >
      {children}
    </div>
  );
}

/** Text to read aloud for the back of a card. */
export function spokenBack(content: CardContent, showVosotros: boolean): string[] {
  if (content.paradigm) {
    return content.paradigm.forms.filter((f, i) => f && (showVosotros || !LANGUAGE.persons[i]?.regionalNote)).map((f) => f);
  }
  const out = [content.entry.lemma];
  if (content.sentence) out.push(content.sentence.es);
  return out;
}
