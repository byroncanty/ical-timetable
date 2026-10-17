// Fetch an iCal feed on behalf of the browser (most calendar hosts don't allow cross-site reads).
// Shared by the Cloudflare Worker and the Vite dev server.

export interface CalendarResult {
  status: number;
  body: string;
  contentType: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const text = (status: number, body: string): CalendarResult => ({ status, body, contentType: 'text/plain; charset=utf-8' });

/** Refuse obviously internal destinations (localhost, private and link-local IP ranges). */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  return false;
}

export function normaliseCalendarUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (isPrivateHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function fetchCalendar(raw: string): Promise<CalendarResult> {
  const url = normaliseCalendarUrl(raw);
  if (!url) return text(400, "That doesn't look like a calendar link. Paste the full https:// or webcal:// address.");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      redirect: 'follow',
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5', 'User-Agent': 'ical-timetable (+https://github.com/byroncanty/ical-timetable)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return text(504, err instanceof Error && err.name === 'TimeoutError' ? 'The calendar server took too long to respond.' : "Couldn't reach the calendar server.");
  }

  if (!res.ok) return text(502, `The calendar server replied with an error (HTTP ${res.status}). Check the link is still valid.`);
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) return text(413, 'That calendar is too large (over 5 MB).');

  const body = await res.text();
  if (body.length > MAX_BYTES) return text(413, 'That calendar is too large (over 5 MB).');
  if (!body.includes('BEGIN:VCALENDAR')) return text(422, "That link didn't return an iCal calendar. Make sure it's the iCal / .ics link, not a web page.");

  return { status: 200, body, contentType: 'text/calendar; charset=utf-8' };
}
