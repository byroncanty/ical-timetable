import { readJSON, writeJSON } from './storage';
import type { TimetableEvent } from './types';

export interface UpNext {
  current?: TimetableEvent; // class in progress right now
  next?: TimetableEvent; // next class to start
  focus?: TimetableEvent; // what the hero shows: current, else next
  nextOnCampus?: TimetableEvent; // next in-person class to start, i.e. the next building to go to
}

/** Events must be sorted by start time (parseIcs does this). */
export function upNext(events: TimetableEvent[], now: Date): UpNext {
  const current = events.find((e) => e.start <= now && e.end > now);
  const next = events.find((e) => e.start > now);
  const nextOnCampus = events.find((e) => e.start > now && e.mode === 'in-person' && !!e.location);
  return { current, next, focus: current ?? next, nextOnCampus };
}

// ---- Room change check -------------------------------------------------------
// Remember the room first seen for each upcoming session, and flag it when the feed later
// reports a different one. Keyed by class + start time, because feed UIDs are just positions.

const SEEN_KEY = 'ical-timetable:seenRooms';
type Seen = Record<string, string | null>;

export const sessionKey = (e: TimetableEvent) => `${e.classKey}@${e.start.toISOString()}`;

/** Pure core: returns the updated memory and, per session key, the previously seen room for changed ones. */
export function diffRooms(seen: Seen, events: TimetableEvent[], now: Date): { seen: Seen; changes: Record<string, string | null> } {
  const nextSeen: Seen = {};
  const changes: Record<string, string | null> = {};
  for (const e of events) {
    if (e.end <= now) continue; // forget past sessions
    const key = sessionKey(e);
    if (key in seen) {
      nextSeen[key] = seen[key];
      if (seen[key] !== e.location) changes[key] = seen[key];
    } else {
      nextSeen[key] = e.location;
    }
  }
  return { seen: nextSeen, changes };
}

export function checkRoomChanges(events: TimetableEvent[], now = new Date()): Record<string, string | null> {
  const { seen, changes } = diffRooms(readJSON<Seen>(SEEN_KEY, {}), events, now);
  writeJSON(SEEN_KEY, seen);
  return changes;
}
