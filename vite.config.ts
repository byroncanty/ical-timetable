/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fetchCalendar } from './worker/src/fetchCalendar.ts';

// Answers POST /proxy locally with the same code as the Cloudflare Worker, so dev needs no Worker.
function calendarProxy(): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
        if (data.length > 10_000) req.destroy();
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      return res.end('Use POST.');
    }
    let url: unknown;
    try {
      url = JSON.parse(await readBody(req))?.url;
    } catch {
      url = undefined;
    }
    if (typeof url !== 'string' || !url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Expected JSON body { "url": "…" }.');
    }
    const r = await fetchCalendar(url);
    res.writeHead(r.status, { 'Content-Type': r.contentType, 'Cache-Control': 'no-store' });
    res.end(r.body);
  };

  return {
    name: 'calendar-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/proxy', handler);
    },
  };
}

export default defineConfig({
  base: './', // relative URLs, so the build works at github.io/<repo>/ or any other path
  plugins: [react(), tailwindcss(), calendarProxy()],
  test: { environment: 'node', env: { TZ: 'Australia/Melbourne' } },
});
