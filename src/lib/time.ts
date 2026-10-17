import { addDays, addWeeks, differenceInCalendarDays, format, startOfWeek } from 'date-fns';

// All dates are local time; the feed and the viewer are both in Melbourne.
export const dateKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const isoWeekday = (d: Date) => Number(format(d, 'i'));
export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const fmt = (d: Date, pattern: string) => format(d, pattern);
export const fmtTime = (d: Date) => format(d, 'h:mm a'); // "8:30 AM"

// Calendar-date keys ("2026-09-02"). Local noon keeps date math clear of DST edges.
export const keyToDate = (key: string) => new Date(`${key}T12:00:00`);
const toKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const mondayOf = (key: string) => toKey(startOfWeek(keyToDate(key), { weekStartsOn: 1 }));
export const addDaysKey = (key: string, n: number) => toKey(addDays(keyToDate(key), n));
export const addWeeksKey = (key: string, n: number) => toKey(addWeeks(keyToDate(key), n));
export const weeksBetween = (a: string, b: string) => Math.round(differenceInCalendarDays(keyToDate(b), keyToDate(a)) / 7);
export const fmtKey = (key: string, pattern: string) => format(keyToDate(key), pattern);

// 12-hour times from minutes since midnight.
const h24 = (min: number) => Math.floor(min / 60) % 24;
const h12 = (min: number) => h24(min) % 12 || 12;
const meridiem = (min: number) => (h24(min) < 12 ? 'AM' : 'PM');
const clock = (min: number) => `${h12(min)}:${String(min % 60).padStart(2, '0')}`;

/** 510 → "8:30 AM" */
export const minToLabel = (min: number) => `${clock(min)} ${meridiem(min)}`;

/** Grid hour labels: 540 → "9 AM", 720 → "12 PM" */
export const hourLabel = (min: number) => `${h12(min)} ${meridiem(min)}`;

/** "8:30–10:30 AM", or "11:30 AM – 1:30 PM" when the class crosses midday. */
export function timeRange(startMin: number, endMin: number): string {
  return meridiem(startMin) === meridiem(endMin) ? `${clock(startMin)}–${clock(endMin)} ${meridiem(endMin)}` : `${minToLabel(startMin)} – ${minToLabel(endMin)}`;
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

/** "in 2h 15m", "in 3d 4h", "in 5m". */
export function countdown(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return `in ${d}d${h ? ` ${h}h` : ''}`;
  if (h) return `in ${h}h${m ? ` ${m}m` : ''}`;
  return m ? `in ${m}m` : 'starting now';
}

/** Ticking countdown for the hero: "1d 10h 05m", "2h 15m", "12m 05s". */
export function liveCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  if (d) return `${d}d ${h}h ${p(m)}m`;
  if (h) return `${h}h ${p(m)}m`;
  return `${m}m ${p(s)}s`;
}
