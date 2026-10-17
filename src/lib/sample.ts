import { addDays, addWeeks, format, startOfWeek } from 'date-fns';

// A made-up university week, generated relative to today so the sample never goes stale.
// Uses weekly repeat rules, one skipped week, campus rooms, an address and an online class.

interface SampleClass {
  title: string;
  day: number; // 0 = Monday
  start: [number, number];
  end: [number, number];
  location: string;
  description?: string;
  skipWeek?: number;
}

const CLASSES: SampleClass[] = [
  { title: 'COSC1076 Advanced Programming, LEC01', day: 0, start: [9, 30], end: [11, 30], location: '080.10.017', description: 'COSC1076_2650_AUSCY, LEC01, 01\\nCOSC1076 Advanced Programming', skipWeek: 5 },
  { title: 'COSC1076 Advanced Programming, TUT01', day: 2, start: [13, 0], end: [14, 0], location: 'Online', description: 'Weekly tutorial on Zoom' },
  { title: 'ISYS1101 Database Concepts, PRA02', day: 3, start: [10, 0], end: [12, 0], location: '014.09.023', description: 'ISYS1101_2650_AUSCY, PRA02, 02\\nISYS1101 Database Concepts' },
  { title: 'ISYS1101 Database Concepts, LEC01', day: 1, start: [11, 30], end: [13, 30], location: '-', description: 'ISYS1101_2650_AUSCY, LEC01, 01\\nISYS1101 Database Concepts' },
  { title: 'Group project meeting', day: 1, start: [15, 0], end: [16, 0], location: 'State Library Victoria, 328 Swanston St, Melbourne' },
];

const WEEKS = 12;
const stamp = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");

export function sampleIcs(today = new Date()): string {
  const firstMonday = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), -2);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ical-timetable//sample//EN', 'X-WR-CALNAME:Sample timetable'];
  CLASSES.forEach((c, i) => {
    const day = addDays(firstMonday, c.day);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ...c.start);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ...c.end);
    lines.push(
      'BEGIN:VEVENT',
      `UID:sample-${i}@ical-timetable`,
      `DTSTAMP:${format(today, "yyyyMMdd'T'HHmmss")}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `RRULE:FREQ=WEEKLY;COUNT=${WEEKS}`,
      ...(c.skipWeek ? [`EXDATE:${stamp(addWeeks(start, c.skipWeek))}`] : []),
      `SUMMARY:${c.title.replace(/,/g, '\\,')}`,
      `LOCATION:${c.location.replace(/,/g, '\\,')}`,
      ...(c.description ? [`DESCRIPTION:${c.description.replace(/,/g, '\\,')}`] : []),
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
