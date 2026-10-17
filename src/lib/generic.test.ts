import { describe, expect, it } from 'vitest';
import { detectDelivery, directionsUrl } from './delivery';
import { calendarName, parseIcs } from './ical';
import { parseSummary } from './parseSummary';
import { sampleIcs } from './sample';
import { lastDayOf } from './weeks';

// Tests run with TZ=Australia/Melbourne (vite.config.ts), like the app's audience.
const NOW = new Date(2026, 9, 17, 12, 0); // Sat 17 Oct 2026

const LONDON_TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/London',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:BST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:GMT',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const ics = (...events: string[][]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', 'X-WR-CALNAME:Work\\, Uni', ...LONDON_TZ, ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

describe('ordinary event titles', () => {
  it('keeps the whole title when there is no unit code', () => {
    expect(parseSummary('Team standup')).toMatchObject({ unitCode: 'Team standup', activity: '', group: '' });
    expect(parseSummary('Maths 101, Room 3')).toMatchObject({ unitCode: 'Maths 101, Room 3', activity: '' });
  });

  it('still recognises university class titles', () => {
    expect(parseSummary('COSC1076 AdvancedProgramming, LEC01')).toMatchObject({ unitCode: 'COSC1076', activity: 'LEC', group: '01' });
  });
});

describe('repeating events', () => {
  const text = ics(
    ['UID:weekly', 'DTSTART:20261102T140000', 'DTEND:20261102T150000', 'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE:20261109T140000', 'SUMMARY:Weekly sync', 'LOCATION:Room 4'],
    ['UID:weekly', 'RECURRENCE-ID:20261116T140000', 'DTSTART:20261116T160000', 'DTEND:20261116T170000', 'SUMMARY:Weekly sync', 'LOCATION:Room 9'],
  );

  it('expands the rule, skips EXDATEs and applies moved occurrences', () => {
    const events = parseIcs(text, {}, NOW);
    expect(events.map((e) => `${e.dateKey} ${e.startMin} ${e.location}`)).toEqual(['2026-11-02 840 Room 4', '2026-11-16 960 Room 9', '2026-11-23 840 Room 4']);
    expect(new Set(events.map((e) => e.uid)).size).toBe(3);
  });

  it('limits never-ending rules to a window around today', () => {
    const daily = parseIcs(ics(['UID:daily', 'DTSTART:20200106T090000', 'DTEND:20200106T093000', 'RRULE:FREQ=DAILY', 'SUMMARY:Daily'], ), {}, NOW);
    expect(daily.length).toBeGreaterThan(500);
    expect(daily.length).toBeLessThan(600);
    expect(daily[0].start.getTime()).toBeGreaterThan(NOW.getTime() - 200 * 86_400_000);
  });
});

describe('times', () => {
  it('converts UTC and other time zones to local time', () => {
    const events = parseIcs(
      ics(
        ['UID:utc', 'DTSTART:20261110T230000Z', 'DTEND:20261111T000000Z', 'SUMMARY:UTC call'],
        ['UID:ldn', 'DTSTART;TZID=Europe/London:20261111T090000', 'DTEND;TZID=Europe/London:20261111T100000', 'SUMMARY:London call'],
      ),
      {},
      NOW,
    );
    const utc = events.find((e) => e.unitCode === 'UTC call')!;
    const ldn = events.find((e) => e.unitCode === 'London call')!;
    expect([utc.dateKey, utc.startMin, utc.weekday]).toEqual(['2026-11-11', 600, 3]); // 23:00Z = 10:00 AEDT next day
    expect([ldn.dateKey, ldn.startMin]).toEqual(['2026-11-11', 1200]); // 09:00 GMT = 20:00 AEDT
  });

  it('skips all-day events', () => {
    expect(parseIcs(ics(['UID:ad', 'DTSTART;VALUE=DATE:20261111', 'SUMMARY:Holiday']), {}, NOW)).toEqual([]);
  });

  it('reads the calendar name', () => {
    expect(calendarName(ics())).toBe('Work, Uni');
  });
});

describe('in person vs online', () => {
  const d = (rawLocation: string, description = '', extra: { url?: string; campusCode?: string } = {}) => detectDelivery({ rawLocation, description, ...extra });

  it('recognises meeting links and platforms', () => {
    expect(d('https://us02web.zoom.us/j/123')).toEqual({ mode: 'online', place: 'Zoom', joinUrl: 'https://us02web.zoom.us/j/123' });
    expect(d('', 'Join Microsoft Teams Meeting https://teams.microsoft.com/l/meetup-join/abc')).toEqual({
      mode: 'online',
      place: 'Microsoft Teams',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc',
    });
    expect(d('Online')).toMatchObject({ mode: 'online', place: 'Online' });
  });

  it('treats myTimetable "-" rooms as online (Canvas at RMIT)', () => {
    expect(d('-', '', { campusCode: 'AUSCY' })).toEqual({ mode: 'online', place: 'Canvas', joinUrl: 'https://rmit.instructure.com' });
    expect(d('-')).toMatchObject({ mode: 'online', place: 'Online' });
  });

  it('treats a physical location as in person', () => {
    expect(d('Room 4.12, Building A')).toEqual({ mode: 'in-person', place: 'Room 4.12, Building A' });
    expect(d('057.06.002', '', { campusCode: 'AUSCY' })).toEqual({ mode: 'in-person', place: 'Melbourne City campus' });
    expect(d('')).toEqual({ mode: 'in-person', place: 'Location not set' });
  });

  it('builds map links for addresses and RMIT buildings', () => {
    expect(directionsUrl({ mode: 'in-person', location: 'State Library Victoria', room: undefined, campusCode: undefined })).toContain('State%20Library%20Victoria');
    expect(directionsUrl({ mode: 'online', location: null, room: undefined, campusCode: undefined })).toBeUndefined();
  });
});

describe('day columns', () => {
  it('shows Monday through the last day that has events', () => {
    const mk = (weekday: number) => ({ weekday }) as Parameters<typeof lastDayOf>[0][number];
    expect(lastDayOf([mk(1), mk(4)])).toBe(4);
    expect(lastDayOf([mk(1)])).toBe(5);
    expect(lastDayOf([mk(2), mk(6)])).toBe(6);
    expect(lastDayOf([])).toBe(5);
  });
});

describe('sample calendar', () => {
  it('has weekly classes with one skipped week and both categories', () => {
    const events = parseIcs(sampleIcs(NOW), {}, NOW);
    expect(events).toHaveLength(5 * 12 - 1);
    expect(events.filter((e) => e.mode === 'online')).toHaveLength(24);
    expect(new Set(events.map((e) => e.place))).toEqual(new Set(['Melbourne City campus', 'Zoom', 'Canvas', 'State Library Victoria, 328 Swanston St, Melbourne']));
    expect(lastDayOf(events)).toBe(4);
  });
});
