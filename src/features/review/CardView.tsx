import type { ReactNode } from "react";
import type { Encounter, Entry, Sense, Sentence } from "@/core/types";

export interface CardContent {
  entry: Entry;
  sense?: Sense;
  allSenses: Sense[];
  sentence?: Sentence;
  encounter?: Encounter;
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

export function CardBack({ content, onSpeak }: { content: CardContent; onSpeak: (text: string) => void }) {
  const { entry, sentence, encounter } = content;
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
