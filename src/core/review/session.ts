/**
 * Review session state machine. Pure and synchronous: every action returns the
 * next state plus the persistence effects the caller must apply. Input sources
 * (touch now; headphone buttons and voice later) only call these actions.
 *
 * EXT: input — implement InputSource to drive `grade` / `repeat` from new devices.
 */
import type { FSRS } from "ts-fsrs";
import type { Card, GradeName, Priority, ReviewLog, ReviewMode } from "@/core/types";
import { GRADE_TO_RATING, gradeState, rollbackState, STATE_LEARNING, STATE_RELEARNING } from "@/core/scheduler/fsrs";
import { dayKey } from "@/core/scheduler/day";

export interface ReviewState {
  /** main queue: due reviews then new cards */
  queue: Card[];
  /** learning cards waiting for their intra-session due time */
  learning: Card[];
  current?: Card;
  flipped: boolean;
  history: HistoryItem[];
  graded: number;
  finished: boolean;
}

interface HistoryItem {
  before: Card;
  after: Card;
  logId: string;
}

export interface Effects {
  upsertCards?: Card[];
  addLogs?: ReviewLog[];
  deleteLogIds?: string[];
}

export interface ReviewEnv {
  now: () => Date;
  newId: () => string;
  schedulerFor: (priority: Priority) => FSRS;
  priorityOf: (card: Card) => Priority;
  leechThresholdOf: (card: Card) => number;
  rolloverHour: number;
  mode: ReviewMode;
  /** learning cards due within this window are shown ahead of time when nothing else is left */
  learnAheadMinutes?: number;
  /** learning cards due beyond this window leave the session (they are for later today) */
  sessionWindowMinutes?: number;
}

export function createReviewState(queue: Card[], learning: Card[]): ReviewState {
  return { queue: [...queue], learning: [...learning], flipped: false, history: [], graded: 0, finished: false };
}

function pickNext(state: ReviewState, env: ReviewEnv): ReviewState {
  const now = env.now().getTime();
  const ahead = (env.learnAheadMinutes ?? 20) * 60_000;
  const learning = [...state.learning].sort(
    (a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime(),
  );
  const first = learning[0];
  if (first && new Date(first.fsrs.due).getTime() <= now) {
    return { ...state, learning: learning.slice(1), current: first, flipped: false };
  }
  const [head, ...rest] = state.queue;
  if (head) {
    return { ...state, queue: rest, learning, current: head, flipped: false };
  }
  if (first && new Date(first.fsrs.due).getTime() <= now + ahead) {
    return { ...state, learning: learning.slice(1), current: first, flipped: false };
  }
  if (first) {
    // Learning cards left but not due yet: show them anyway rather than ending the session.
    return { ...state, learning: learning.slice(1), current: first, flipped: false };
  }
  return { ...state, current: undefined, flipped: false, finished: true };
}

export function start(state: ReviewState, env: ReviewEnv): ReviewState {
  return pickNext(state, env);
}

export function flip(state: ReviewState): ReviewState {
  if (!state.current) return state;
  return { ...state, flipped: true };
}

export function grade(
  state: ReviewState,
  g: GradeName,
  env: ReviewEnv,
): { state: ReviewState; effects: Effects } {
  const card = state.current;
  if (!card) return { state, effects: {} };
  const now = env.now();
  const scheduler = env.schedulerFor(env.priorityOf(card));
  const result = gradeState(scheduler, card.fsrs, g, now);
  const nowIso = now.toISOString();
  const after: Card = {
    ...card,
    fsrs: result.state,
    status: card.status === "buried" ? "active" : card.status,
    introducedOn: card.introducedOn ?? dayKey(now, env.rolloverHour),
    updatedAt: nowIso,
  };
  if (after.fsrs.lapses >= env.leechThresholdOf(card) && g === "again") {
    after.status = "suspended";
    after.flagged = true;
  }
  const log: ReviewLog = {
    id: env.newId(),
    cardId: card.id,
    rating: GRADE_TO_RATING[g],
    mode: env.mode,
    reviewedAt: nowIso,
    fsrsLog: result.log,
  };

  const learning = [...state.learning];
  const st = after.fsrs.state;
  const window = (env.sessionWindowMinutes ?? 60) * 60_000;
  const dueMs = new Date(after.fsrs.due).getTime();
  if (
    after.status === "active" &&
    (st === STATE_LEARNING || st === STATE_RELEARNING) &&
    dueMs <= now.getTime() + window
  ) {
    learning.push(after);
  }

  const next: ReviewState = {
    ...state,
    learning,
    history: [...state.history.slice(-9), { before: card, after, logId: log.id }],
    graded: state.graded + 1,
  };
  return { state: pickNext(next, env), effects: { upsertCards: [after], addLogs: [log] } };
}

/** Put the current card back a few positions without grading it. */
export function repeat(state: ReviewState, env: ReviewEnv): ReviewState {
  const card = state.current;
  if (!card) return state;
  const queue = [...state.queue];
  queue.splice(Math.min(3, queue.length), 0, card);
  return pickNext({ ...state, queue }, env);
}

/** Skip the current card for the rest of today. */
export function bury(
  state: ReviewState,
  env: ReviewEnv,
  buriedUntil: string,
): { state: ReviewState; effects: Effects } {
  const card = state.current;
  if (!card) return { state, effects: {} };
  const after: Card = { ...card, status: "buried", buriedUntil, updatedAt: env.now().toISOString() };
  return { state: pickNext(state, env), effects: { upsertCards: [after] } };
}

export function toggleFlag(
  state: ReviewState,
  env: ReviewEnv,
): { state: ReviewState; effects: Effects } {
  const card = state.current;
  if (!card) return { state, effects: {} };
  const after: Card = { ...card, flagged: !card.flagged, updatedAt: env.now().toISOString() };
  return { state: { ...state, current: after }, effects: { upsertCards: [after] } };
}

export function undo(
  state: ReviewState,
  env: ReviewEnv,
  logOf: (logId: string) => ReviewLog | undefined,
): { state: ReviewState; effects: Effects } {
  const last = state.history[state.history.length - 1];
  if (!last) return { state, effects: {} };
  const log = logOf(last.logId);
  const scheduler = env.schedulerFor(env.priorityOf(last.before));
  // Prefer the library rollback (keeps counters consistent); fall back to the snapshot.
  const restoredFsrs = log ? rollbackState(scheduler, last.after.fsrs, log.fsrsLog) : last.before.fsrs;
  const restored: Card = { ...last.before, fsrs: restoredFsrs, updatedAt: env.now().toISOString() };

  // Put the card back in front, remove the graded copy from learning if present, and
  // return the current card (if any) to the head of the queue.
  const learning = state.learning.filter((c) => c.id !== last.after.id);
  const queue = state.current ? [state.current, ...state.queue] : [...state.queue];
  const next: ReviewState = {
    ...state,
    queue,
    learning,
    current: restored,
    flipped: false,
    history: state.history.slice(0, -1),
    graded: Math.max(0, state.graded - 1),
    finished: false,
  };
  return { state: next, effects: { upsertCards: [restored], deleteLogIds: [last.logId] } };
}

export function remaining(state: ReviewState): number {
  return state.queue.length + state.learning.length + (state.current ? 1 : 0);
}
