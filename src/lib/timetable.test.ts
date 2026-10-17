import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIcs } from './ical';
import { diffRooms, sessionKey, upNext } from './nextClass';
import { fmtTime, hourLabel, liveCountdown, minToLabel, timeRange } from './time';
import { layoutDay } from './layout';
import { parseDescription, parseSummary } from './parseSummary';
import { parseRoom } from './rooms';
import { gridRange, initialWeek, lastDayOf, termInfo, typicalWeek, weekLabel } from './weeks';

const feed = readFileSync(new URL('./__fixtures__/feed.ics', import.meta.url), 'utf8');
const events = parseIcs(feed);

describe('parseSummary', () => {
  it('splits unit, name, activity and group', () => {
    expect(parseSummary('ICTPRG430 AppInroOOPLangSkills\\, LEC01')).toEqual({
      unitCode: 'ICTPRG430',
      unitShortName: 'AppInroOOPLangSkills',
      activity: 'LEC',
      activityLabel: 'Lecture',
      group: '01',
    });
  });

  it('handles a unit code glued to the name', () => {
    const s = parseSummary('ICTNWK420InstallCongVirtualMac, PRA01');
    expect([s.unitCode, s.unitShortName, s.activity, s.group]).toEqual(['ICTNWK420', 'InstallCongVirtualMac', 'PRA', '01']);
  });

  it('accepts escaped and unescaped commas alike', () => {
    expect(parseSummary('BSBXCS402 PromWrkpCybSecAwaren\\, TUT02')).toEqual(parseSummary('BSBXCS402 PromWrkpCybSecAwaren, TUT02'));
  });

  it('keeps names that contain ampersands', () => {
    expect(parseSummary('ICTNWK542 InstOp&TrbshtMedEntR, LEC01').unitShortName).toBe('InstOp&TrbshtMedEntR');
  });
});

describe('parseDescription', () => {
  it('reads the course code and hides empty staff', () => {
    expect(parseDescription('COSC7391C_2601_3150_AUSCY, LEC01, 01\nICTPRG430 AppInroOOPLangSkills\nStaff: -\nLocation: -')).toEqual({
      courseCode: 'COSC7391C',
      campusCode: 'AUSCY',
      staff: null,
    });
  });

  it('handles literal escaped newlines', () => {
    expect(parseDescription('X1234_1\\, LEC01\\nName\\nStaff: Dr Smith').staff).toBe('Dr Smith');
  });
});

describe('parseRoom', () => {
  it('formats RMIT room codes', () => {
    expect(parseRoom('057.06.002')).toEqual({
      building: '57',
      level: '6',
      room: '002',
      name: 'Building #57',
      label: 'Building #57 · Level 6 · Room 002',
      short: 'B #57 · L6 · R002',
    });
  });
  it('treats "-" as no room', () => {
    expect(parseRoom('-')).toBeUndefined();
  });
});

describe('parseIcs (real feed fixture)', () => {
  it('parses all 135 events', () => {
    expect(events).toHaveLength(135);
  });

  it('unescapes text and resolves locations', () => {
    const e = events.find((x) => x.location === '057.06.002')!;
    expect(e.room?.label).toBe('Building #57 · Level 6 · Room 002');
    expect(events.every((x) => !x.raw.summary.includes('\\,'))).toBe(true);
    expect(events.filter((x) => x.location === null).length).toBe(60);
  });

  it('keeps the Wednesday ICTPRG430 lecture at 08:30 before and after the October clock change', () => {
    const lec = events.filter((e) => e.classKey === 'ICTPRG430|LEC|01');
    const before = lec.find((e) => e.dateKey === '2026-09-30')!;
    const after = lec.find((e) => e.dateKey === '2026-10-07')!;
    expect([before.startMin, before.endMin, before.weekday]).toEqual([510, 630, 3]);
    expect([after.startMin, after.endMin, after.weekday]).toEqual([510, 630, 3]);
  });

  it('splits classes into in person (has a room) and online (Canvas)', () => {
    expect(events.filter((e) => e.mode === 'in-person')).toHaveLength(75);
    expect(events.filter((e) => e.mode === 'online')).toHaveLength(60);
    expect(events.every((e) => (e.mode === 'online') === (e.location === null))).toBe(true);
    expect(new Set(events.filter((e) => e.mode === 'online').map((e) => e.place))).toEqual(new Set(['Canvas']));
    expect(new Set(events.filter((e) => e.mode === 'in-person').map((e) => e.place))).toEqual(new Set(['Melbourne City campus']));
    expect(new Set(events.map((e) => e.campusCode))).toEqual(new Set(['AUSCY']));
  });

  it('only has classes Monday to Thursday', () => {
    expect(Math.max(...events.map((e) => e.weekday))).toBeLessThanOrEqual(4);
  });

  it('uses friendly names when given', () => {
    const named = parseIcs(feed, { ICTSAS527: 'Manage Client Problems' });
    expect(named.find((e) => e.unitCode === 'ICTSAS527')!.unitName).toBe('Manage Client Problems');
  });
});

describe('weeks', () => {
  const term = termInfo(events)!;

  it('finds the term span', () => {
    expect(term.firstWeek).toBe('2026-08-31');
    expect(term.lastWeek).toBe('2026-12-14');
  });

  it('opens on the current week inside the term, else the nearest class week', () => {
    expect(initialWeek(term, '2026-10-17')).toBe('2026-10-12');
    expect(initialWeek(term, '2027-02-01')).toBe('2026-12-14');
    expect(initialWeek(term, '2026-01-05')).toBe('2026-08-31');
  });

  it('collapses the term into nine regular classes', () => {
    const typical = typicalWeek(events);
    expect(typical).toHaveLength(9);
    expect(typical.every((t) => t.sessions.length === 15)).toBe(true);
  });

  it('labels weeks Monday to Thursday', () => {
    expect(lastDayOf(events)).toBe(4);
    expect(weekLabel('2026-10-12', 4)).toBe('12 – 15 Oct 2026');
    expect(weekLabel('2026-09-28', 4)).toBe('28 Sep – 1 Oct 2026');
    expect(weekLabel('2026-10-12', 5)).toBe('12 – 16 Oct 2026');
  });

  it('fits the grid to the classes', () => {
    const r = gridRange(events);
    expect(r.start).toBeLessThanOrEqual(8 * 60);
    expect(r.end).toBeGreaterThan(r.start);
  });
});

describe('layoutDay', () => {
  it('puts overlapping blocks side by side', () => {
    const laid = layoutDay([
      { startMin: 540, endMin: 600 },
      { startMin: 570, endMin: 630 },
      { startMin: 700, endMin: 760 },
    ]);
    expect(laid.map((l) => [l.col, l.cols])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });
});

describe('upNext', () => {
  it('finds the next class and the next building on a weekend', () => {
    // Saturday 17 Oct: next class is Monday's online tutorial; first campus class is Tuesday's practical.
    const r = upNext(events, new Date(2026, 9, 17, 12, 0));
    expect(r.current).toBeUndefined();
    expect(r.focus?.classKey).toBe('BSBXCS402|TUT|01');
    expect(r.focus?.mode).toBe('online');
    expect(r.nextOnCampus?.classKey).toBe('ICTNWK542|PRA|01');
    expect(r.nextOnCampus?.room?.building).toBe('57');
  });

  it('shows the class in progress as current', () => {
    const r = upNext(events, new Date(2026, 9, 20, 14, 0)); // Tue 14:00, during the 13:00–17:00 practical
    expect(r.current?.classKey).toBe('ICTNWK542|PRA|01');
    expect(r.focus).toBe(r.current);
  });
});

describe('room change check', () => {
  const now = new Date(2026, 9, 17);
  const upcoming = events.filter((e) => e.end > now);

  it('remembers rooms the first time without flagging anything', () => {
    const { seen, changes } = diffRooms({}, events, now);
    expect(Object.keys(seen)).toHaveLength(upcoming.length);
    expect(changes).toEqual({});
  });

  it('flags a session whose room changed since it was last seen', () => {
    const { seen } = diffRooms({}, events, now);
    const target = upcoming.find((e) => e.location === '057.06.002')!;
    const moved = events.map((e) => (e === target ? { ...e, location: '080.10.017' } : e));
    expect(diffRooms(seen, moved, now).changes).toEqual({ [sessionKey(target)]: '057.06.002' });
  });
});

describe('liveCountdown', () => {
  it('formats days, hours, minutes and seconds', () => {
    expect(liveCountdown(((1 * 24 + 10) * 60 + 5) * 60_000)).toBe('1d 10h 05m');
    expect(liveCountdown((2 * 60 + 15) * 60_000)).toBe('2h 15m');
    expect(liveCountdown((12 * 60 + 5) * 1000)).toBe('12m 05s');
    expect(liveCountdown(-5000)).toBe('0m 00s');
  });
});

describe('12-hour times', () => {
  it('labels times with AM and PM', () => {
    expect(minToLabel(510)).toBe('8:30 AM');
    expect(minToLabel(720)).toBe('12:00 PM');
    expect(minToLabel(810)).toBe('1:30 PM');
    expect(minToLabel(0)).toBe('12:00 AM');
    expect(fmtTime(new Date(2026, 9, 20, 13, 0))).toBe('1:00 PM');
  });

  it('labels grid hours', () => {
    expect([540, 720, 1020].map(hourLabel)).toEqual(['9 AM', '12 PM', '5 PM']);
  });

  it('shortens ranges within one half of the day', () => {
    expect(timeRange(510, 630)).toBe('8:30–10:30 AM');
    expect(timeRange(780, 1020)).toBe('1:00–5:00 PM');
    expect(timeRange(690, 810)).toBe('11:30 AM – 1:30 PM');
  });
});
