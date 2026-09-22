/**
 * Domain types. Every persisted row carries a ULID `id` and ISO-8601 UTC
 * timestamps. Soft-deletable rows carry `deletedAt`.
 */

export type Priority = "essential" | "core" | "standard" | "niche";
export const PRIORITIES: readonly Priority[] = ["essential", "core", "standard", "niche"];

export type Pos =
  | "noun"
  | "verb"
  | "adj"
  | "adv"
  | "phrase"
  | "prep"
  | "conj"
  | "pron"
  | "interj"
  | "num"
  | "other";

export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** LANG: the app is Spanish-only for now; the field exists so a second language is additive. */
export type Lang = "es";

export type Regional = "neutral" | "chile"; // VARIETY

export type EntryStatus = "active" | "suspended" | "trashed";

export interface VerbProfile {
  irregular: boolean;
  /** auto = follow the SPEC rules; on/off = per-verb override */
  paradigmCards: "auto" | "on" | "off";
  conjugationRef?: string;
}

export interface Entry {
  id: string;
  lang: Lang;
  lemma: string;
  pos: Pos;
  isPhrase: boolean;
  gender?: "m" | "f";
  article?: string;
  plural?: string;
  priority: Priority;
  priorityAuto: boolean;
  frequencyRank?: number;
  cefr?: Cefr;
  regional: Regional;
  note?: string;
  tags: string[];
  verb?: VerbProfile;
  status: EntryStatus;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Sense {
  id: string;
  entryId: string;
  gloss: string;
  order: number;
  reflexive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Sentence {
  id: string;
  es: string; // LANG
  en: string;
  origin: "source" | "generated";
  sourceId?: string;
  audioKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Encounter {
  id: string;
  entryId: string;
  sentenceId: string;
  /** [start, end) character offsets of the target inside sentence.es */
  span?: [number, number];
  form?: string;
  tense?: string;
  person?: string;
  createdAt: string;
}

/** Mirror of ts-fsrs Card, stored with camelCase keys and ISO dates. */
export interface FsrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: 0 | 1 | 2 | 3;
  lastReview?: string;
}

export type CardType = "production" | "paradigm";
export type CardStatus = "active" | "suspended" | "buried";

export interface Card {
  id: string;
  entryId: string;
  senseId?: string;
  type: CardType;
  /** paradigm cards only; key = entryId + tense */
  tense?: string;
  fsrs: FsrsState;
  status: CardStatus;
  buriedUntil?: string;
  flagged: boolean;
  /** day key (see core/scheduler/day) of the first grade; used for the daily new-card limit */
  introducedOn?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewMode = "tap" | "typed" | "audio" | "voice";
/** Binary self-grading. Easy was removed in phase 2; old logs may still carry rating 4. */
export type GradeName = "again" | "good";

export interface ReviewLog {
  id: string;
  cardId: string;
  /** ts-fsrs Rating: 1 Again, 3 Good (4 Easy only in logs from the web phase) */
  rating: 1 | 3 | 4;
  mode: ReviewMode;
  reviewedAt: string;
  /** ts-fsrs ReviewLog, kept verbatim for the optimizer and for undo */
  fsrsLog: {
    rating: number;
    state: number;
    due: string;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    lastElapsedDays: number;
    scheduledDays: number;
    learningSteps: number;
    review: string;
  };
}

export type SourceType = "photo" | "paste" | "text" | "srt" | "translate" | "lookups" | "manual" | "seed";

/** One translate lookup (in-app or from the Shortcuts log); becomes a draft on the next "Create cards from lookups". */
export interface Lookup {
  id: string;
  at: string;
  dir: "en-es" | "es-en";
  src: string;
  dst: string;
  provider: "apple" | "claude" | "shortcuts";
  /** Claude's suggested flashcard entry, when the lookup went through Claude */
  draft?: EntryDraft;
  consumedAt?: string;
  batchId?: string;
}

export interface Source {
  id: string;
  type: SourceType;
  label: string;
  pageRef?: string;
  imageHash?: string;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  sourceId: string;
  /** one tag per batch, written on every entry the batch creates or touches */
  tag?: string;
  stage: "scanned" | "drafted" | "done";
  counts: { found: number; known: number; new: number };
  createdAt: string;
  updatedAt: string;
}

export type SuggestionGroup = "words" | "phrases" | "fromSentences";
export type SuggestionDecision = "accepted" | "excluded" | "ignored";

/** What the LLM (or the paste import) proposes for one entry. */
export interface EntryDraft {
  lemma: string;
  pos: Pos;
  isPhrase: boolean;
  gender?: "m" | "f";
  article?: string;
  plural?: string;
  senses: { gloss: string; reflexive?: boolean }[];
  priority: Priority;
  cefr?: Cefr;
  usefulness?: number;
  frequencyRank?: number;
  regional: Regional;
  note?: string;
  verb?: { irregular: boolean };
  sourceSentence?: { es: string; en: string; span?: [number, number] };
  generatedSentence?: { es: string; en: string; span?: [number, number]; verbForm?: string };
  fromSentence: { lemma: string; pos: Pos; gloss: string; span?: [number, number] }[];
  pageRef?: string;
}

export interface Suggestion {
  id: string;
  batchId: string;
  group: SuggestionGroup;
  draft: EntryDraft;
  checked: boolean;
  existingEntryId?: string;
  didYouMean?: string;
  decision?: SuggestionDecision;
  /** for fromSentences items: the suggestion whose generated sentence they came from */
  parentSuggestionId?: string;
  createdAt: string;
}

export interface IgnoreEntry {
  /** `${lemma}|${pos}` */
  key: string;
  createdAt: string;
}

export interface TensePlanRow {
  tense: string;
  order: number;
  status: "locked" | "active";
}

export type PlaybackMode = "display" | "audioOn" | "handsFree";
export type Chunking = "conservative" | "balanced" | "generous";

export interface Settings {
  id: "settings";
  dailyNewLimit: number;
  sessionCap: number;
  quotas: Record<Priority, number>;
  retention: Record<Priority, number>;
  leechThreshold: Record<Priority, number>;
  playback: PlaybackMode;
  chunking: Chunking;
  showVosotros: boolean; // VARIETY
  dayRolloverHour: number;
  model: string;
  anthropicKey?: string;
  openaiKey?: string;
  voiceURI?: string;
  speechRate: number;
  seedVersion?: number;
  /** FSRS parameters (w); undefined = library defaults */
  fsrsWeights?: number[];
  /** Token usage for the current month (cost meter) */
  llmUsage?: LlmUsage;
  /** Warn above this many USD per day; hard stop at twice this */
  dailySpendCapUsd: number;
  /** Newest translate-log timestamp already imported; older lines are skipped */
  translateLogImportedUntil?: string;
  /** Default translator on the translate screen; "apple" only exists in the native app */
  translateProvider: "apple" | "claude";
  /** iCloud snapshot + change-log state (native only) */
  cloud?: CloudState;
  /** voice review: seconds between the spoken front and the flip, and how long to listen */
  voicePauseSeconds: number;
  voiceListenSeconds: number;
  updatedAt: string;
}

export interface CloudState {
  /** outbox rows up to this seq are in the change log or the snapshot */
  lastSeq: number;
  /** `exportedAt` of the last snapshot this device wrote or restored */
  lastSnapshotAt?: string;
  /** a bulk delete happened; the change log cannot express it, write a snapshot */
  snapshotDirty: boolean;
}

export interface LlmUsage {
  /** YYYY-MM */
  month: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** estimated USD this month */
  usd: number;
  /** YYYY-MM-DD of `todayUsd` */
  day: string;
  todayUsd: number;
}

export interface OutboxRow {
  seq?: number;
  table: string;
  rowId: string;
  op: "upsert" | "delete";
  at: string;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  dailyNewLimit: 20,
  sessionCap: 200,
  quotas: { essential: 0.6, core: 0.25, standard: 0.12, niche: 0.03 },
  retention: { essential: 0.95, core: 0.92, standard: 0.9, niche: 0.85 },
  leechThreshold: { essential: 12, core: 8, standard: 6, niche: 4 },
  playback: "audioOn",
  chunking: "balanced",
  showVosotros: true,
  dayRolloverHour: 4,
  model: "claude-opus-5",
  speechRate: 0.95,
  dailySpendCapUsd: 1,
  translateProvider: "apple",
  voicePauseSeconds: 3,
  voiceListenSeconds: 4,
  updatedAt: new Date(0).toISOString(),
};
