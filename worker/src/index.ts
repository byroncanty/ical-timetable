// Cloudflare Worker: POST { "url": "<iCal link>" } → the calendar file, for the timetable site only.
import { fetchCalendar } from './fetchCalendar';

interface Env {
  ALLOWED_ORIGINS: string; // comma-separated, e.g. "https://byroncanty.github.io,http://localhost:5173"
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (!allowed.includes(origin)) return new Response('Not allowed from this site.', { status: 403 });

    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Use POST.', { status: 405, headers: cors });

    let url: unknown;
    try {
      url = ((await request.json()) as { url?: unknown })?.url;
    } catch {
      url = undefined;
    }
    if (typeof url !== 'string' || !url) return new Response('Expected JSON body { "url": "…" }.', { status: 400, headers: cors });

    const r = await fetchCalendar(url);
    return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': r.contentType, 'Cache-Control': 'no-store' } });
  },
};
