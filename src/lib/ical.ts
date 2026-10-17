import ICAL from 'ical.js';
import { detectDelivery } from './delivery';
import { parseDescription, parseSummary } from './parseSummary';
import { normaliseLocation, parseRoom } from './rooms';
import { dateKey, isoWeekday, minutesOfDay, mondayOf } from './time';
import type { TimetableEvent } from './types';

const DAY_MS = 86_400_000;
// Repeating events are expanded within this window around "now".
const WINDOW_BEFORE_DAYS = 183;
const WINDOW_AFTER_DAYS = 366;
const MAX_STEPS_PER_SERIES = 20_000; // safety limit when walking a repeat rule
const MAX_OCCURRENCES_PER_SERIES = 1_000;

/** X-WR-CALNAME, the calendar's display name, if it has one. */
export function calendarName(text: string): string | undefined {
  const m = text.match(/^X-WR-CALNAME:(.+)$/m);
  return m ? m[1].trim().replace(/\\,/g, ',').replace(/\\;/g, ';') || undefined : undefined;
}

function toEvent(item: ICAL.Event, startT: ICAL.Time, endT: ICAL.Time | null, uid: string, friendlyNames: Record<string, string>): TimetableEvent | null {
  if (startT.isDate) return null; // all-day entries aren't timetable blocks
  // TZID times convert through the calendar's VTIMEZONE; floating times stay as written.
  const start = startT.toJSDate();
  const end = endT && !endT.isDate ? endT.toJSDate() : new Date(start.getTime() + 3_600_000);

  const summary = item.summary ?? '';
  const description = item.description ?? '';
  const rawLocation = item.location ?? '';
  const urlProp = item.component.getFirstPropertyValue('url');
  const s = parseSummary(summary);
  const d = parseDescription(description);
  const location = normaliseLocation(rawLocation);
  const delivery = detectDelivery({ rawLocation, description, url: typeof urlProp === 'string' ? urlProp : undefined, campusCode: d.campusCode });

  const dk = dateKey(start);
  const startMin = minutesOfDay(start);
  // Clamp events that run past midnight to the end of the day.
  const endMin = dateKey(end) === dk ? minutesOfDay(end) : 24 * 60;

  return {
    uid,
    start,
    end,
    ...s,
    unitName: friendlyNames[s.unitCode] || s.unitShortName || s.unitCode,
    location,
    ...delivery,
    room: parseRoom(location),
    staff: d.staff,
    courseCode: d.courseCode,
    campusCode: d.campusCode,
    raw: { summary, description },
    classKey: `${s.unitCode}|${s.activity}|${s.group}`,
    dateKey: dk,
    weekKey: mondayOf(dk),
    weekday: isoWeekday(start),
    startMin,
    endMin: Math.max(endMin, startMin + 15),
  };
}

export function parseIcs(text: string, friendlyNames: Record<string, string> = {}, now = new Date()): TimetableEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(vtz);

  const all = root.getAllSubcomponents('vevent').map((v) => new ICAL.Event(v));
  const exceptions = all.filter((e) => e.isRecurrenceException());
  const series = all.filter((e) => !e.isRecurrenceException());

  // Attach moved/edited occurrences (RECURRENCE-ID) to their repeating series.
  const orphans: ICAL.Event[] = [];
  for (const ex of exceptions) {
    const master = series.find((m) => m.uid === ex.uid && m.isRecurring());
    if (master) master.relateException(ex);
    else orphans.push(ex);
  }

  const windowStart = ICAL.Time.fromJSDate(new Date(now.getTime() - WINDOW_BEFORE_DAYS * DAY_MS), true);
  const windowEnd = ICAL.Time.fromJSDate(new Date(now.getTime() + WINDOW_AFTER_DAYS * DAY_MS), true);
  const events: TimetableEvent[] = [];

  series.forEach((ev, i) => {
    if (!ev.startDate) return;
    const uid = ev.uid || `event-${i}`;
    if (!ev.isRecurring()) {
      const e = toEvent(ev, ev.startDate, ev.endDate, uid, friendlyNames);
      if (e) events.push(e);
      return;
    }
    const it = ev.iterator();
    let next: ICAL.Time | null;
    let steps = 0;
    let added = 0;
    while ((next = it.next()) && steps++ < MAX_STEPS_PER_SERIES && added < MAX_OCCURRENCES_PER_SERIES) {
      if (next.compare(windowEnd) > 0) break;
      const occ = ev.getOccurrenceDetails(next);
      if (occ.endDate.compare(windowStart) < 0) continue;
      const e = toEvent(occ.item, occ.startDate, occ.endDate, `${uid}@${occ.recurrenceId.toString()}`, friendlyNames);
      if (e) {
        events.push(e);
        added++;
      }
    }
  });

  orphans.forEach((ex, i) => {
    const e = toEvent(ex, ex.startDate, ex.endDate, `${ex.uid || `orphan-${i}`}@${ex.startDate.toString()}`, friendlyNames);
    if (e) events.push(e);
  });

  return events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.unitCode.localeCompare(b.unitCode));
}
