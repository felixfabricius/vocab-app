/**
 * Builds today's review session from the card pool. Pure: takes arrays and
 * settings, returns three lists.
 *
 * - due:      review-state cards due before the next rollover, sorted by class
 *             then by how overdue they are; overflow postpones lowest class first
 * - learning: learning/relearning cards due within the learn-ahead window
 * - fresh:    new cards to introduce today, by class quota, then by frequency rank
 */
import type { Card, Entry, Priority, Settings } from "@/core/types";
import { PRIORITIES } from "@/core/types";
import { PRIORITY_ORDER } from "@/core/priority/rank";
import { dayEnd, dayKey } from "./day";
import { STATE_LEARNING, STATE_NEW, STATE_RELEARNING } from "./fsrs";

export interface SessionInput {
  cards: Card[];
  entriesById: Map<string, Entry>;
  settings: Settings;
  now: Date;
  /** minutes a learning card may be shown before its due time */
  learnAheadMinutes?: number;
}

export interface Session {
  due: Card[];
  learning: Card[];
  fresh: Card[];
  /** new cards already introduced today, before this session */
  introducedToday: number;
}

function priorityOf(card: Card, entries: Map<string, Entry>): Priority {
  return entries.get(card.entryId)?.priority ?? "niche";
}

function overdueRatio(card: Card, now: Date): number {
  const due = new Date(card.fsrs.due).getTime();
  const late = (now.getTime() - due) / 86_400_000;
  const interval = Math.max(card.fsrs.scheduledDays, 0.01);
  return late / interval;
}

export function buildSession(input: SessionInput): Session {
  const { cards, entriesById, settings, now } = input;
  const learnAheadMs = (input.learnAheadMinutes ?? 20) * 60_000;
  const endOfDay = dayEnd(now, settings.dayRolloverHour).getTime();
  const today = dayKey(now, settings.dayRolloverHour);

  const usable = cards.filter((c) => {
    if (c.status === "suspended") return false;
    if (c.status === "buried") return !c.buriedUntil || new Date(c.buriedUntil).getTime() <= now.getTime();
    const entry = entriesById.get(c.entryId);
    return !!entry && entry.status === "active";
  });

  const due: Card[] = [];
  const learning: Card[] = [];
  const fresh: Card[] = [];
  let introducedToday = 0;

  for (const c of usable) {
    const st = c.fsrs.state;
    const dueMs = new Date(c.fsrs.due).getTime();
    if (st === STATE_NEW) {
      fresh.push(c);
    } else if (st === STATE_LEARNING || st === STATE_RELEARNING) {
      if (c.introducedOn === today) introducedToday++;
      if (dueMs <= now.getTime() + learnAheadMs) learning.push(c);
    } else {
      if (c.introducedOn === today) introducedToday++;
      if (dueMs < endOfDay) due.push(c);
    }
  }

  // Due: class first, then most overdue first.
  due.sort((a, b) => {
    const pa = PRIORITY_ORDER[priorityOf(a, entriesById)];
    const pb = PRIORITY_ORDER[priorityOf(b, entriesById)];
    if (pa !== pb) return pa - pb;
    return overdueRatio(b, now) - overdueRatio(a, now);
  });
  // Overflow: keep the first sessionCap; since sorted by class, lowest classes fall off first.
  const dueCapped = due.slice(0, settings.sessionCap);

  learning.sort((a, b) => new Date(a.fsrs.due).getTime() - new Date(b.fsrs.due).getTime());

  // New cards: quota per class, unused quota flows down, then any remaining fill in class order.
  const remaining = Math.max(settings.dailyNewLimit - introducedToday, 0);
  const byClass = new Map<Priority, Card[]>();
  for (const p of PRIORITIES) byClass.set(p, []);
  for (const c of fresh) byClass.get(priorityOf(c, entriesById))!.push(c);
  for (const list of byClass.values()) {
    list.sort((a, b) => {
      const ra = entriesById.get(a.entryId)?.frequencyRank ?? Number.POSITIVE_INFINITY;
      const rb = entriesById.get(b.entryId)?.frequencyRank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  }

  const picked: Card[] = [];
  let carry = 0;
  for (const p of PRIORITIES) {
    const quota = Math.floor(remaining * settings.quotas[p]) + carry;
    const list = byClass.get(p)!;
    const take = list.splice(0, Math.min(quota, list.length));
    picked.push(...take);
    carry = quota - take.length;
  }
  // Rounding leftovers and any carry still unused: fill from the top class down.
  let left = remaining - picked.length;
  for (const p of PRIORITIES) {
    if (left <= 0) break;
    const list = byClass.get(p)!;
    const take = list.splice(0, Math.min(left, list.length));
    picked.push(...take);
    left -= take.length;
  }

  return { due: dueCapped, learning, fresh: picked, introducedToday };
}
