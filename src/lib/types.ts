import type { DeliveryMode } from './delivery';

export type Activity = 'LEC' | 'TUT' | 'PRA' | (string & {});

export interface Room {
  building: string;
  level: string;
  room: string;
  name: string; // "Building #57"
  label: string; // "Building #57 · Level 6 · Room 002"
  short: string; // "B #57 · L6 · R002", for narrow cards
}

export interface TimetableEvent {
  uid: string; // unique per occurrence (recurring events get "<uid>@<start>")
  start: Date;
  end: Date;
  unitCode: string; // "ICTPRG430" for university feeds, otherwise the event title
  unitShortName: string; // "AppInroOOPLangSkills" (university feeds only)
  unitName: string; // friendly name; equals unitCode for ordinary events unless renamed
  activity: Activity; // "LEC", or "" when the title has no activity code
  activityLabel: string; // "Lecture"
  group: string; // "01"
  location: string | null; // LOCATION, null when empty or "-"
  mode: DeliveryMode; // in person or online
  place: string; // in person: campus or address; online: "Canvas", "Zoom", "Online"…
  joinUrl?: string; // online meeting / course link when one is found
  room?: Room; // RMIT-style room codes only
  staff: string | null;
  courseCode?: string; // "COSC7391C"
  campusCode?: string; // "AUSCY", from an Allocate offering code
  raw: { summary: string; description: string };

  // Derived in local time, for layout.
  classKey: string; // unit|activity|group, identifies the recurring class
  dateKey: string; // "2026-09-02"
  weekKey: string; // Monday of that week, "2026-08-31"
  weekday: number; // 1 = Monday … 7 = Sunday
  startMin: number; // minutes since midnight
  endMin: number;
}

/** A positioned block in a grid or agenda: either one real session or a typical-week template. */
export interface GridItem {
  id: string;
  event: TimetableEvent; // the representative session
  weekday: number;
  startMin: number;
  endMin: number;
  badge?: string;
  subtitle?: string;
}
