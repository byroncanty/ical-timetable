import type { TimetableEvent } from './types';

export type DeliveryMode = 'in-person' | 'online';

export const MODES: DeliveryMode[] = ['in-person', 'online'];
export const MODE_LABEL: Record<DeliveryMode, string> = { 'in-person': 'In person', online: 'Online' };

// Campus codes found at the end of Allocate (myTimetable) offering codes.
const CAMPUS_NAMES: Record<string, string> = { AUSCY: 'Melbourne City campus' };
export const campusName = (code?: string) => (code ? CAMPUS_NAMES[code] : undefined);

const RMIT_CANVAS_URL = 'https://rmit.instructure.com';

const PLATFORMS: [RegExp, string][] = [
  [/zoom\.us|\bzoom\b/i, 'Zoom'],
  [/teams\.microsoft|teams\.live|\bms teams\b|\bmicrosoft teams\b/i, 'Microsoft Teams'],
  [/meet\.google|\bgoogle meet\b/i, 'Google Meet'],
  [/webex/i, 'Webex'],
  [/instructure\.com|\bcanvas\b/i, 'Canvas'],
];
const ONLINE_WORDS = /\b(online|virtual|remote|zoom|teams|webex|google meet|canvas)\b/i;
const URL_RE = /https?:\/\/[^\s<>"')\\]+/i;

export interface Delivery {
  mode: DeliveryMode;
  place: string;
  joinUrl?: string;
}

/**
 * In person vs online:
 * - a location that's a link or mentions Zoom/Teams/online → online
 * - Allocate feeds (myTimetable) use "-" for classes with no room → online (Canvas at RMIT)
 * - otherwise a location means in person
 */
export function detectDelivery(input: { rawLocation: string; description: string; url?: string; campusCode?: string }): Delivery {
  const loc = input.rawLocation.trim();
  const locIsUrl = /^https?:\/\//i.test(loc);
  const noRoom = !loc || loc === '-';
  const haystack = `${loc}\n${input.description}\n${input.url ?? ''}`;
  const platform = PLATFORMS.find(([re]) => re.test(haystack))?.[1];

  const online = locIsUrl || ONLINE_WORDS.test(loc) || (noRoom && (loc === '-' || !!input.campusCode || !!platform));
  if (!online) return { mode: 'in-person', place: campusName(input.campusCode) ?? (loc || 'Location not set') };

  const place = platform ?? (input.campusCode ? 'Canvas' : 'Online');
  const joinUrl = (locIsUrl ? loc : undefined) ?? input.url ?? haystack.match(URL_RE)?.[0] ?? (place === 'Canvas' && input.campusCode ? RMIT_CANVAS_URL : undefined);
  return { mode: 'online', place, joinUrl };
}

/** Short "where" for cards and lists: the room or address, or the online platform. */
export function whereShort(e: Pick<TimetableEvent, 'mode' | 'place' | 'location' | 'room'>): string {
  if (e.mode === 'online') return e.place;
  return e.room?.label ?? e.location ?? e.place;
}

/** Map search for the event's location: Apple Maps on iPhone/iPad, Google Maps elsewhere. */
export function directionsUrl(e: Pick<TimetableEvent, 'mode' | 'room' | 'location' | 'campusCode'>): string | undefined {
  if (e.mode !== 'in-person') return undefined;
  const q = e.room && e.campusCode?.startsWith('AUS') ? `RMIT University Building ${e.room.building}, Melbourne VIC` : e.location;
  if (!q) return undefined;
  const query = encodeURIComponent(q);
  const apple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  return apple ? `https://maps.apple.com/?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** The place(s) for a category in the key: "Canvas", "Zoom, Canvas", "Melbourne City campus", or a generic word. */
export function commonPlace(events: TimetableEvent[], mode: DeliveryMode): string {
  const places = [...new Set(events.filter((e) => e.mode === mode).map((e) => e.place))];
  if (places.length === 1) return places[0];
  if (mode === 'online') return places.length && places.length <= 3 ? places.join(', ') : 'Online';
  return 'On site';
}
