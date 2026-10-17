import { sampleIcs } from './sample';
import { readJSON, writeJSON } from './storage';

/** Where the timetable comes from. Saved per browser; nothing is stored on a server. */
export type Source = { kind: 'url'; url: string } | { kind: 'file'; name: string } | { kind: 'sample' };

export interface FeedResult {
  text: string;
  fetchedAt: Date;
  stale: boolean; // served from the local copy because the fetch failed
  error?: string;
}

interface Cached {
  sourceId: string;
  text: string;
  fetchedAt: string;
}

const CACHE_KEY = 'ical-timetable:feed';

// Calendar hosts don't allow cross-site reads, so links are fetched by a small Cloudflare Worker
// (VITE_PROXY_URL at build time). In dev, the Vite server answers /proxy with the same code.
export const PROXY_URL: string = import.meta.env.VITE_PROXY_URL || `${import.meta.env.BASE_URL}proxy`;

/** Saved sources come from localStorage, so check the shape before trusting them. */
export function asSource(value: unknown): Source | null {
  const v = value as Partial<{ kind: string; url: unknown; name: unknown }> | null;
  if (v?.kind === 'sample') return { kind: 'sample' };
  if (v?.kind === 'url' && typeof v.url === 'string' && v.url) return { kind: 'url', url: v.url };
  if (v?.kind === 'file' && typeof v.name === 'string' && v.name) return { kind: 'file', name: v.name };
  return null;
}

export const sourceId = (s: Source) => (s.kind === 'url' ? `url:${s.url}` : s.kind === 'file' ? `file:${s.name}` : 'sample');

export function sourceLabel(s: Source): string {
  if (s.kind === 'sample') return 'Sample calendar';
  if (s.kind === 'file') return s.name;
  try {
    return new URL(s.url.replace(/^webcals?:/i, 'https:')).hostname;
  } catch {
    return 'Calendar link';
  }
}

/** Download an iCal link through the fetcher. Throws with a readable message. */
export async function fetchCalendarText(url: string): Promise<string> {
  let res: Response;
  try {
    // The link goes in the POST body so it stays out of URLs and logs.
    res = await fetch(PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), cache: 'no-store' });
  } catch {
    throw new Error("Couldn't reach the calendar fetcher. Check your internet connection and try again.");
  }
  const text = await res.text();
  if (!res.ok) throw new Error(text || `The calendar fetcher returned HTTP ${res.status}.`);
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That link didn't return an iCal calendar.");
  return text;
}

export function cacheFeed(source: Source, text: string): void {
  writeJSON(CACHE_KEY, { sourceId: sourceId(source), text, fetchedAt: new Date().toISOString() } satisfies Cached);
}

function readCache(source: Source): Cached | null {
  const c = readJSON<Cached | null>(CACHE_KEY, null);
  return c && c.sourceId === sourceId(source) && typeof c.text === 'string' ? c : null;
}

/** Load the saved source, falling back to the last good copy when a link can't be fetched. */
export async function loadFeed(source: Source): Promise<FeedResult> {
  if (source.kind === 'sample') return { text: sampleIcs(), fetchedAt: new Date(), stale: false };
  if (source.kind === 'file') {
    const c = readCache(source);
    if (!c) throw new Error('The uploaded file is no longer saved in this browser. Please import it again.');
    return { text: c.text, fetchedAt: new Date(c.fetchedAt), stale: false };
  }
  try {
    const text = await fetchCalendarText(source.url);
    cacheFeed(source, text);
    return { text, fetchedAt: new Date(), stale: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const c = readCache(source);
    if (c) return { text: c.text, fetchedAt: new Date(c.fetchedAt), stale: true, error: message };
    throw new Error(message);
  }
}
