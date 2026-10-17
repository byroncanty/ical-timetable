# iCal Timetable

Turn **any iCal calendar** into a modern weekly timetable. Import a link from your uni timetable (e.g. RMIT
myTimetable), Google Calendar, Outlook or iCloud, or upload an `.ics` file.

- **Import calendar:** paste an iCal / webcal link, upload a `.ics` file, or try the built-in sample. The link
  is saved only in your browser and re-checked every 10 minutes.
- **Next up:** a live countdown to the next event and where to go. That's the room or address with Directions
  (Apple Maps on iPhone), or the online platform (Zoom, Teams, Meet, Canvas) with a Join/Open button.
- **In person vs online:** green "In person" and purple "Online" badges on every event, with striped cards for
  online, plus a key whose categories you can toggle
- **Week grid:** a Monday–Friday week with a "now" line and 12-hour AM/PM times. On weekends it opens on the
  coming week.
- **Typical week:** the whole calendar collapsed into one repeating week, with skipped-week badges
- **Agenda:** a day-by-day list. Phones get one day at a time with swipe.
- Repeating events (RRULE) with skipped (EXDATE) and moved (RECURRENCE-ID) occurrences, UTC and time-zoned times
- University feeds get extras: unit codes, Lecture/Tutorial/Practical pills, RMIT rooms as "Building #57 · Level 6 · Room 002"
- Filters, renameable titles, light/dark, print, PNG export, offline copy, and a home-screen app on iPhone

## How calendar links are fetched

Most calendar hosts (RMIT, Google, Outlook…) don't allow other websites to read their `.ics` files, so the
browser can't download them directly. A tiny **Cloudflare Worker** (`worker/`) does it instead:

- The browser sends the link in a POST body, never in the URL, and the Worker returns the calendar.
- It only answers requests from the sites in `ALLOWED_ORIGINS` (`worker/wrangler.toml`).
- It only returns real iCal files, blocks private network addresses, caps size at 5 MB and time at 15 seconds,
  and stores nothing.
- In development, the Vite dev server runs the same code at `/proxy`, so no Worker is needed.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest unit tests
```

## Deploy (free)

**1. Worker (Cloudflare):**

```bash
cd worker
npm install
npx wrangler login     # once, opens the browser
npx wrangler deploy    # prints https://ical-timetable-proxy.<you>.workers.dev
```

If the site lives somewhere other than `https://byroncanty.github.io`, edit `ALLOWED_ORIGINS` in
`worker/wrangler.toml` first.

**2. Site (GitHub Pages):**

1. Push this repo to GitHub.
2. **Settings → Secrets and variables → Actions → Variables:** add `VITE_PROXY_URL` = the Worker URL.
3. **Settings → Pages → Source:** choose **GitHub Actions**.
4. Push to `main` (or run the workflow). The site goes live at `https://<username>.github.io/<repo>/`.

## Structure

```
worker/src/fetchCalendar.ts  fetch + validate an iCal link (shared by the Worker and the dev server)
worker/src/index.ts          Cloudflare Worker: origin check, CORS, POST { url }
src/lib/ical.ts              ical.js → events: repeat expansion, exceptions, time zones, all-day skip
src/lib/delivery.ts          in person vs online, platform detection, join links, directions
src/lib/parseSummary.ts      university titles ("ICTPRG430 …, LEC01") vs ordinary titles
src/lib/rooms.ts             RMIT room codes → Building #57 · Level 6 · Room 002
src/lib/weeks.ts             Mon–Fri week, typical-week grouping, grid range
src/lib/feed.ts              saved source, fetching via the Worker, local cache, offline fallback
src/lib/sample.ts            sample timetable generated relative to today
src/components/              ImportDialog, NextClass, WeekGrid, EventCard, Key, EventDrawer, AgendaView, Filters
```
