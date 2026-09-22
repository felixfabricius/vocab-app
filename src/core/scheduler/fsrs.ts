/**
 * Thin wrapper over ts-fsrs. Converts between our stored FsrsState (camelCase,
 * ISO strings) and the library's Card (snake_case, Date), and maps our two
 * grades onto the library's ratings.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as LibCard,
  type FSRS,
  type Grade,
  type ReviewLog as LibLog,
} from "ts-fsrs";
import type { FsrsState, GradeName, ReviewLog } from "@/core/types";

export const GRADE_TO_RATING: Record<GradeName, 1 | 3> = {
  again: Rating.Again as 1,
  good: Rating.Good as 3,
};

export interface SchedulerOptions {
  requestRetention: number;
  weights?: number[];
  enableFuzz?: boolean;
}

export function makeScheduler(opts: SchedulerOptions): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: opts.requestRetention,
      enable_fuzz: opts.enableFuzz ?? true,
      enable_short_term: true,
      ...(opts.weights ? { w: opts.weights } : {}),
    }),
  );
}

export function toLibCard(s: FsrsState): LibCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    ...(s.lastReview ? { last_review: new Date(s.lastReview) } : {}),
  };
}

export function fromLibCard(c: LibCard): FsrsState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as 0 | 1 | 2 | 3,
    ...(c.last_review ? { lastReview: c.last_review.toISOString() } : {}),
  };
}

export function fromLibLog(l: LibLog): ReviewLog["fsrsLog"] {
  return {
    rating: l.rating,
    state: l.state,
    due: l.due.toISOString(),
    stability: l.stability,
    difficulty: l.difficulty,
    elapsedDays: l.elapsed_days,
    lastElapsedDays: l.last_elapsed_days,
    scheduledDays: l.scheduled_days,
    learningSteps: l.learning_steps,
    review: l.review.toISOString(),
  };
}

export function toLibLog(l: ReviewLog["fsrsLog"]): LibLog {
  return {
    rating: l.rating as Rating,
    state: l.state as State,
    due: new Date(l.due),
    stability: l.stability,
    difficulty: l.difficulty,
    elapsed_days: l.elapsedDays,
    last_elapsed_days: l.lastElapsedDays,
    scheduled_days: l.scheduledDays,
    learning_steps: l.learningSteps,
    review: new Date(l.review),
  };
}

export function newFsrsState(now: Date): FsrsState {
  return fromLibCard(createEmptyCard(now));
}

export interface GradeResult {
  state: FsrsState;
  log: ReviewLog["fsrsLog"];
}

export function gradeState(
  scheduler: FSRS,
  state: FsrsState,
  grade: GradeName,
  now: Date,
): GradeResult {
  const item = scheduler.next(toLibCard(state), now, GRADE_TO_RATING[grade] as Grade);
  return { state: fromLibCard(item.card), log: fromLibLog(item.log) };
}

/** Reverse a grade using the stored log (for undo). */
export function rollbackState(
  scheduler: FSRS,
  state: FsrsState,
  log: ReviewLog["fsrsLog"],
): FsrsState {
  return fromLibCard(scheduler.rollback(toLibCard(state), toLibLog(log)));
}

export function retrievability(scheduler: FSRS, state: FsrsState, now: Date): number {
  return scheduler.get_retrievability(toLibCard(state), now, false);
}

export const STATE_NEW = State.New;
export const STATE_LEARNING = State.Learning;
export const STATE_REVIEW = State.Review;
export const STATE_RELEARNING = State.Relearning;
