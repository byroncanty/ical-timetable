import { addDaysKey, fmtKey, mondayOf, weeksBetween } from './time';
import type { GridItem, TimetableEvent } from './types';

/** The timetable is a Monday–Friday week (1 = Mon … 5 = Fri); weekend events aren't shown in the grid. */
export const LAST_DAY = 5;

export const dayRange = (lastDay: number) => Array.from({ length: lastDay }, (_, i) => i + 1);
export const inDays = (weekday: number, lastDay: number) => weekday >= 1 && weekday <= lastDay;

export interface TermInfo {
  firstWeek: string;
  lastWeek: string;
  weeksWithClasses: Set<string>;
}

export function termInfo(events: TimetableEvent[]): TermInfo | null {
  if (!events.length) return null;
  const weeks = events.map((e) => e.weekKey).sort();
  return { firstWeek: weeks[0], lastWeek: weeks[weeks.length - 1], weeksWithClasses: new Set(weeks) };
}

/** Calendars spanning more than this many weeks don't show "Week N" (it only makes sense for a term). */
export const MAX_TERM_WEEKS = 26;
export const isTermLike = (term: TermInfo) => weeksBetween(term.firstWeek, term.lastWeek) + 1 <= MAX_TERM_WEEKS;

/** Teaching week number, counted from the week of the first class. */
export const teachingWeek = (weekKey: string, term: TermInfo) => weeksBetween(term.firstWeek, weekKey) + 1;

export const inTerm = (weekKey: string, term: TermInfo) => weekKey >= term.firstWeek && weekKey <= term.lastWeek;

/** Current week when inside the term, otherwise the nearest week that has classes. */
export function initialWeek(term: TermInfo | null, todayKey: string): string {
  const thisWeek = mondayOf(todayKey);
  if (!term || inTerm(thisWeek, term)) return thisWeek;
  let best = term.firstWeek;
  let bestDist = Infinity;
  for (const w of term.weeksWithClasses) {
    const dist = Math.abs(weeksBetween(thisWeek, w));
    if (dist < bestDist) [best, bestDist] = [w, dist];
  }
  return best;
}

export const eventsInWeek = (events: TimetableEvent[], weekKey: string) => events.filter((e) => e.weekKey === weekKey);

export const toGridItem = (e: TimetableEvent): GridItem => ({ id: e.uid, event: e, weekday: e.weekday, startMin: e.startMin, endMin: e.endMin });

export interface TypicalClass extends GridItem {
  sessions: TimetableEvent[];
  missing: number;
}

/** Collapse the term into one repeating week: one block per class + weekday + time slot. */
export function typicalWeek(events: TimetableEvent[]): TypicalClass[] {
  const groups = new Map<string, TimetableEvent[]>();
  for (const e of events) {
    const key = `${e.classKey}|${e.weekday}|${e.startMin}|${e.endMin}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  // The most common slot per class is "regular"; others are moved or one-off sessions.
  const maxPerClass = new Map<string, number>();
  for (const list of groups.values()) {
    const k = list[0].classKey;
    maxPerClass.set(k, Math.max(maxPerClass.get(k) ?? 0, list.length));
  }

  return [...groups.entries()].map(([key, sessions]) => {
    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const weeks = new Set(sessions.map((s) => s.weekKey)).size;
    const missing = weeksBetween(first.weekKey, last.weekKey) + 1 - weeks;
    const irregular = sessions.length < (maxPerClass.get(first.classKey) ?? 0) / 2;
    const range = sessions.length > 1 ? `${fmtKey(first.dateKey, 'd MMM')} – ${fmtKey(last.dateKey, 'd MMM')}` : fmtKey(first.dateKey, 'd MMM');
    return {
      id: key,
      event: first,
      weekday: first.weekday,
      startMin: first.startMin,
      endMin: first.endMin,
      sessions,
      missing,
      subtitle: `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${range}`,
      badge: irregular ? 'One-off / moved' : missing > 0 ? `${missing} wk skipped` : undefined,
    };
  });
}

/** Visible hours: fit the earliest and latest class, padded by 30 min. Falls back to 08:00–18:00. */
export function gridRange(events: TimetableEvent[], lastDay = 7): { start: number; end: number } {
  const weekday = events.filter((e) => inDays(e.weekday, lastDay));
  if (!weekday.length) return { start: 8 * 60, end: 18 * 60 };
  const min = Math.min(...weekday.map((e) => e.startMin));
  const max = Math.max(...weekday.map((e) => e.endMin));
  const start = Math.max(0, Math.floor((min - 30) / 60) * 60);
  const end = Math.min(24 * 60, Math.ceil((max + 30) / 60) * 60);
  return { start, end };
}

export function weekLabel(weekKey: string, lastDay = 5): string {
  const end = addDaysKey(weekKey, lastDay - 1);
  const sameMonth = fmtKey(weekKey, 'MMM') === fmtKey(end, 'MMM');
  return `${fmtKey(weekKey, sameMonth ? 'd' : 'd MMM')} – ${fmtKey(end, 'd MMM yyyy')}`;
}
