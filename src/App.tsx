import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { AgendaView, type AgendaDay } from './components/AgendaView';
import { EventDrawer } from './components/EventDrawer';
import { Filters, type UnitInfo } from './components/Filters';
import { CalendarPlus, ChevronLeft, ChevronRight, Download, Moon, Printer, Sun } from './components/icons';
import { ImportDialog } from './components/ImportDialog';
import { Key } from './components/Key';
import { NextClass } from './components/NextClass';
import { WeekGrid, type DayColumn } from './components/WeekGrid';
import { useLocalState, useMediaQuery, useNow, useTheme } from './hooks';
import { commonPlace, type DeliveryMode } from './lib/delivery';
import { asSource, cacheFeed, fetchCalendarText, loadFeed, sourceId, sourceLabel, type FeedResult, type Source } from './lib/feed';
import { calendarName, parseIcs } from './lib/ical';
import { checkRoomChanges } from './lib/nextClass';
import { addDaysKey, addWeeksKey, dateKey, fmtKey, isoWeekday, minutesOfDay, mondayOf } from './lib/time';
import type { GridItem, TimetableEvent } from './lib/types';
import { DEFAULT_UNIT_NAMES, buildHueMap, hueOf } from './lib/units';
import {
  dayRange,
  eventsInWeek,
  gridRange,
  inDays,
  inTerm,
  initialWeek,
  isTermLike,
  lastDayOf,
  teachingWeek,
  termInfo,
  toGridItem,
  typicalWeek,
  weekLabel,
} from './lib/weeks';

type View = 'week' | 'typical' | 'agenda';
type FeedState =
  | { status: 'empty' }
  | { status: 'loading'; previous?: FeedResult }
  | { status: 'ready'; feed: FeedResult }
  | { status: 'error'; message: string };

const VIEWS: { id: View; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'typical', label: 'Typical week' },
  { id: 'agenda', label: 'Agenda' },
];
// Re-check calendar links this often, and when the tab comes back after a while.
const RECHECK_MS = 10 * 60_000;
const STALE_ON_FOCUS_MS = 5 * 60_000;
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function App() {
  const [storedSource, setSource] = useLocalState<Source | null>('ical-timetable:source', null);
  const source = useMemo(() => asSource(storedSource), [storedSource]);
  const [names, setNames] = useLocalState<Record<string, string>>('ical-timetable:names', {});
  const [hiddenUnits, setHiddenUnits] = useLocalState<string[]>('ical-timetable:hiddenUnits', []);
  const [hiddenActivities, setHiddenActivities] = useLocalState<string[]>('ical-timetable:hiddenActivities', []);
  const [hiddenModes, setHiddenModes] = useLocalState<DeliveryMode[]>('ical-timetable:hiddenModes', []);
  const [view, setView] = useLocalState<View>('ical-timetable:view', 'week');
  const [state, setState] = useState<FeedState>({ status: 'loading' });
  const [reloadTick, setReloadTick] = useState(0);
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [dir, setDir] = useState(1);
  const [selected, setSelected] = useState<{ event: TimetableEvent; typical: boolean } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const primed = useRef<{ id: string; feed: FeedResult } | null>(null); // a calendar just imported, so it isn't fetched twice
  const { dark, toggle: toggleTheme } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const now = useNow(30_000);

  // Load the saved calendar on start, when it changes, on "Try again" and on the timers below.
  useEffect(() => {
    if (!source) return setState({ status: 'empty' });
    if (primed.current?.id === sourceId(source)) {
      setState({ status: 'ready', feed: primed.current.feed });
      primed.current = null;
      return;
    }
    let cancelled = false;
    setState((s) => ({ status: 'loading', previous: s.status === 'ready' ? s.feed : s.status === 'loading' ? s.previous : undefined }));
    loadFeed(source)
      .then((feed) => !cancelled && setState({ status: 'ready', feed }))
      .catch((err: Error) => !cancelled && setState({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [source, reloadTick]);

  const lastCheck = useRef(0);
  const isLink = source?.kind === 'url';
  useEffect(() => {
    if (!isLink) return;
    const recheck = () => setReloadTick((t) => t + 1);
    const id = setInterval(recheck, RECHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && Date.now() - lastCheck.current > STALE_ON_FOCUS_MS && recheck();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isLink]);

  const feed = state.status === 'ready' ? state.feed : state.status === 'loading' ? state.previous : undefined;
  const friendlyNames = useMemo(() => ({ ...DEFAULT_UNIT_NAMES, ...names }), [names]);

  const parsed = useMemo(() => {
    if (!feed) return { events: [] as TimetableEvent[], error: null as string | null };
    try {
      return { events: parseIcs(feed.text, friendlyNames), error: null };
    } catch (err) {
      return { events: [], error: `Couldn't read the calendar: ${err instanceof Error ? err.message : String(err)}` };
    }
  }, [feed, friendlyNames]);
  const events = parsed.events;
  const title = (feed && calendarName(feed.text)) || 'Timetable';

  // Compare each fresh copy of the calendar with the locations seen before.
  const [roomChanges, setRoomChanges] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!feed || !events.length) return;
    if (!feed.stale) lastCheck.current = feed.fetchedAt.getTime();
    setRoomChanges(checkRoomChanges(events));
  }, [feed, events]);

  // ---- Importing ----
  const switchCalendar = (next: Source, text?: string) => {
    if (text !== undefined) primed.current = { id: sourceId(next), feed: { text, fetchedAt: new Date(), stale: false } };
    setHiddenUnits([]);
    setHiddenActivities([]);
    setHiddenModes([]);
    setWeekKey(null);
    setSelected(null);
    setSource(next);
    setImportOpen(false);
  };
  const checkHasEvents = (text: string) => {
    if (!text.includes('BEGIN:VEVENT')) throw new Error('That calendar is empty: it has no events at all. Check the whole link was copied, or that the timetable has classes in it.');
    if (!parseIcs(text).length) throw new Error("That calendar doesn't have any timed events to show. All-day events (like holidays) aren't shown on the timetable.");
  };
  const importUrl = async (url: string) => {
    const text = await fetchCalendarText(url);
    checkHasEvents(text);
    const next: Source = { kind: 'url', url };
    cacheFeed(next, text);
    switchCalendar(next, text);
  };
  const importFile = async (name: string, text: string) => {
    checkHasEvents(text);
    const next: Source = { kind: 'file', name };
    cacheFeed(next, text);
    switchCalendar(next, text);
  };

  // ---- Derived timetable ----
  const units: UnitInfo[] = useMemo(() => {
    const map = new Map<string, UnitInfo>();
    for (const e of events) if (!map.has(e.unitCode)) map.set(e.unitCode, { code: e.unitCode, shortName: e.unitShortName, defaultName: DEFAULT_UNIT_NAMES[e.unitCode] ?? (e.unitShortName || e.unitCode) });
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [events]);
  const activities = useMemo(() => [...new Set(events.map((e) => e.activity))].filter(Boolean).sort(), [events]);
  const hueMap = useMemo(() => buildHueMap(units.map((u) => u.code)), [units]);
  const hueFor = useCallback((code: string) => hueOf(hueMap, code), [hueMap]);

  // Unit/activity filters first; the key's in-person/online toggles apply on top.
  const filtered = useMemo(
    () => events.filter((e) => !hiddenUnits.includes(e.unitCode) && !hiddenActivities.includes(e.activity)),
    [events, hiddenUnits, hiddenActivities],
  );
  const visible = useMemo(() => filtered.filter((e) => !hiddenModes.includes(e.mode)), [filtered, hiddenModes]);
  const term = useMemo(() => termInfo(events), [events]);
  const lastDay = useMemo(() => lastDayOf(events), [events]);
  const days = dayRange(lastDay);
  const range = useMemo(() => gridRange(events, lastDay), [events, lastDay]);
  const todayKey = dateKey(now);
  // Once this week's last day has passed (e.g. Friday for a Mon–Thu timetable), "this week" means the coming one.
  const thisWeek = inDays(isoWeekday(now), lastDay) ? mondayOf(todayKey) : addWeeksKey(mondayOf(todayKey), 1);

  // Pick the starting week once events arrive.
  useEffect(() => {
    if (weekKey == null && events.length) setWeekKey(initialWeek(term, thisWeek));
  }, [events.length, term, thisWeek, weekKey]);

  const week = weekKey ?? thisWeek;
  const weekEvents = useMemo(() => eventsInWeek(visible, week).filter((e) => inDays(e.weekday, lastDay)), [visible, week, lastDay]);
  const typical = useMemo(() => typicalWeek(visible).filter((t) => inDays(t.weekday, lastDay)), [visible, lastDay]);
  const gridItems: GridItem[] = view === 'typical' ? typical : weekEvents.map(toGridItem);

  const moveWeek = useCallback(
    (delta: number) => {
      setDir(delta < 0 ? -1 : 1);
      setWeekKey((w) => addWeeksKey(w ?? thisWeek, delta));
    },
    [thisWeek],
  );
  const goToday = useCallback(() => {
    setDir(week > thisWeek ? -1 : 1);
    setWeekKey(thisWeek);
  }, [week, thisWeek]);

  // ← / → change week, T jumps to this week.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected || importOpen || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || view === 'typical') return;
      if (e.key === 'ArrowLeft') moveWeek(-1);
      else if (e.key === 'ArrowRight') moveWeek(1);
      else if (e.key.toLowerCase() === 't') goToday();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveWeek, goToday, selected, importOpen, view]);

  const typicalView = view === 'typical';
  const columns: DayColumn[] = days.map((wd) => {
    const key = addDaysKey(week, wd - 1);
    return {
      weekday: wd,
      label: typicalView ? fmtKey(key, 'EEEE') : fmtKey(key, 'EEE'),
      sub: typicalView ? undefined : fmtKey(key, 'd MMM'),
      isToday: !typicalView && key === todayKey,
    };
  });
  const agendaDays: AgendaDay[] = days.map((wd) => {
    const key = addDaysKey(week, wd - 1);
    return {
      weekday: wd,
      label: fmtKey(key, 'EEEE'),
      short: fmtKey(key, 'EEE'),
      sub: typicalView ? undefined : fmtKey(key, 'd MMM'),
      isToday: !typicalView && key === todayKey,
      items: gridItems.filter((i) => i.weekday === wd),
    };
  });
  const todayWeekday = columns.find((c) => c.isToday)?.weekday ?? null;

  // Key counts ignore the mode toggles, so a hidden category still shows how many events it holds.
  const modeCounts = useMemo(() => {
    const pool = typicalView ? typicalWeek(filtered).map((t) => t.event) : eventsInWeek(filtered, week);
    const shown = pool.filter((e) => inDays(e.weekday, lastDay));
    return { 'in-person': shown.filter((e) => e.mode === 'in-person').length, online: shown.filter((e) => e.mode === 'online').length };
  }, [filtered, typicalView, week, lastDay]);
  const places = useMemo(() => ({ 'in-person': commonPlace(events, 'in-person'), online: commonPlace(events, 'online') }), [events]);
  const animKey = typicalView ? 'typical' : week;

  const exportPng = async () => {
    if (!gridRef.current) return;
    setExporting(true);
    try {
      const url = await toPng(gridRef.current, { pixelRatio: 2, backgroundColor: dark ? '#18181b' : '#ffffff' });
      const a = document.createElement('a');
      a.href = url;
      a.download = typicalView ? 'timetable-typical-week.png' : `timetable-${week}.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  const resetPrefs = () => {
    setNames({});
    setHiddenUnits([]);
    setHiddenActivities([]);
    setHiddenModes([]);
  };

  const weekNo = term && isTermLike(term) && !typicalView ? (inTerm(week, term) ? `Week ${teachingWeek(week, term)}` : 'Outside term') : null;
  const showGrid = !isMobile && view !== 'agenda';
  const error = state.status === 'error' ? state.message : parsed.error;
  const statusText = source?.kind === 'file' ? `Imported from ${source.name}` : source?.kind === 'sample' ? 'Sample timetable' : undefined;

  const importButton = (
    <button type="button" onClick={() => setImportOpen(true)} className="btn-primary px-3.5 py-2 shadow-md shadow-indigo-600/20">
      <CalendarPlus width={17} height={17} />
      <span className="hidden sm:inline">Import calendar</span>
      <span className="sm:hidden">Import</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-10 sm:px-6 lg:px-8">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-tight font-semibold tracking-tight">{title}</h1>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{source ? sourceLabel(source) : 'Any iCal calendar, as a weekly timetable'}</p>
          </div>
        </div>
        <div className="no-print flex items-center gap-2">
          {importButton}
          <button type="button" className="btn-icon" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun width={16} height={16} /> : <Moon width={16} height={16} />}
          </button>
        </div>
      </header>

      {state.status === 'empty' ? (
        <section className="mt-8 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-md dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500" aria-hidden />
          <div className="px-6 py-10 text-center sm:px-10 sm:py-14">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <CalendarPlus width={28} height={28} />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Turn any calendar into a weekly timetable</h2>
            <p className="mx-auto mt-2 max-w-xl text-zinc-600 dark:text-zinc-300">
              Paste an iCal link from your uni timetable, Google Calendar, Outlook or iCloud. You'll get your week at a glance, a live countdown to what's next, and in-person
              vs online events marked clearly.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setImportOpen(true)} className="btn-primary px-5 py-2.5 text-base shadow-lg shadow-indigo-600/25">
                <CalendarPlus width={18} height={18} /> Import calendar
              </button>
              <button type="button" onClick={() => switchCalendar({ kind: 'sample' })} className="btn px-5 py-2.5 text-base">
                Try the sample timetable
              </button>
            </div>
            <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">Your calendar link stays in this browser. Nothing is stored on a server.</p>
          </div>
        </section>
      ) : error && !events.length ? (
        <div className="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/40">
          <p className="font-medium text-rose-800 dark:text-rose-200">Couldn't load this calendar</p>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => setReloadTick((t) => t + 1)}>
              Try again
            </button>
            <button type="button" className="btn" onClick={() => setImportOpen(true)}>
              Import a different calendar
            </button>
          </div>
        </div>
      ) : state.status === 'ready' && !events.length ? (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium">This calendar has no timed events to show</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">All-day events (like holidays) aren't shown on the timetable.</p>
          <div className="mt-4">{importButton}</div>
        </div>
      ) : !events.length ? (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading timetable">
          <div className="h-[220px] animate-pulse rounded-3xl bg-zinc-200/70 dark:bg-zinc-800/60" />
          <div className="h-[560px] animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/60" />
        </div>
      ) : (
        <>
          <div className="no-print mt-5">
            <NextClass
              events={events}
              roomChanges={roomChanges}
              checkedAt={feed?.fetchedAt}
              offline={!!feed?.stale}
              statusText={statusText}
              hueFor={hueFor}
              onSelect={(e) => setSelected({ event: e, typical: false })}
            />
          </div>

          {/* Controls */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {typicalView ? (
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Typical week</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">The whole calendar collapsed into one repeating week</p>
                </div>
              ) : (
                <>
                  <div className="no-print flex items-center">
                    <button type="button" className="btn-icon rounded-r-none" onClick={() => moveWeek(-1)} aria-label="Previous week" title="Previous week (←)">
                      <ChevronLeft width={16} height={16} />
                    </button>
                    <button type="button" className="btn-icon -ml-px rounded-l-none" onClick={() => moveWeek(1)} aria-label="Next week" title="Next week (→)">
                      <ChevronRight width={16} height={16} />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold tracking-tight" aria-live="polite">
                      {weekLabel(week, lastDay)}
                    </h2>
                    {weekNo && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{weekNo}</p>}
                  </div>
                  {week !== thisWeek && (
                    <button type="button" className="btn no-print ml-1" onClick={goToday} title="This week (T)">
                      This week
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="View" className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={view === v.id}
                    onClick={() => {
                      setView(v.id);
                      setDir(1);
                    }}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition ${view === v.id ? 'bg-white shadow-sm dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <Filters
                units={units}
                activities={activities}
                hiddenUnits={hiddenUnits}
                hiddenActivities={hiddenActivities}
                names={names}
                hueFor={hueFor}
                onToggleUnit={(c) => setHiddenUnits((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]))}
                onToggleActivity={(a) => setHiddenActivities((h) => (h.includes(a) ? h.filter((x) => x !== a) : [...h, a]))}
                onRename={(c, n) => setNames((m) => ({ ...m, [c]: n }))}
                onReset={resetPrefs}
              />
              {showGrid && (
                <>
                  <button type="button" className="btn-icon" onClick={() => window.print()} aria-label="Print" title="Print (A4 landscape)">
                    <Printer width={16} height={16} />
                  </button>
                  <button type="button" className="btn-icon" onClick={exportPng} disabled={exporting} aria-label="Download as PNG" title="Download as PNG">
                    <Download width={16} height={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <Key
              counts={modeCounts}
              places={places}
              hiddenModes={hiddenModes}
              onToggleMode={(m) => setHiddenModes((h) => (h.includes(m) ? h.filter((x) => x !== m) : [...h, m]))}
              activities={activities}
              units={units.map((u) => ({ code: u.code, name: friendlyNames[u.code] || u.shortName || u.code }))}
              hueFor={hueFor}
            />
          </div>

          <main className="mt-4">
            {showGrid ? (
              <WeekGrid
                ref={gridRef}
                items={gridItems}
                days={columns}
                range={range}
                nowMin={todayWeekday ? minutesOfDay(now) : null}
                hueFor={hueFor}
                onSelect={(i) => setSelected({ event: i.event, typical: typicalView })}
                animKey={animKey}
                dir={dir}
              />
            ) : (
              <AgendaView
                days={agendaDays}
                single={isMobile}
                hueFor={hueFor}
                onSelect={(i) => setSelected({ event: i.event, typical: typicalView })}
                onEdge={typicalView ? undefined : moveWeek}
                animKey={animKey}
              />
            )}
            {!typicalView && gridItems.length === 0 && showGrid && (
              <p className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Nothing on this week{hiddenUnits.length + hiddenActivities.length + hiddenModes.length ? ' (some events are hidden)' : ''}.
              </p>
            )}
          </main>

          <footer className="no-print mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
            <kbd className="font-sans">←</kbd> <kbd className="font-sans">→</kbd> change week · <kbd className="font-sans">T</kbd> this week
          </footer>
        </>
      )}

      {selected && (
        <EventDrawer
          event={selected.event}
          allEvents={events}
          term={term}
          hue={hueFor(selected.event.unitCode)}
          now={now}
          typical={selected.typical}
          onClose={() => setSelected(null)}
          onJump={(e) => {
            if (view === 'typical') setView('week');
            setDir(e.weekKey < week ? -1 : 1);
            setWeekKey(e.weekKey);
            setSelected({ event: e, typical: false });
          }}
        />
      )}

      {importOpen && (
        <ImportDialog
          current={source}
          onImportUrl={importUrl}
          onImportFile={importFile}
          onSample={() => switchCalendar({ kind: 'sample' })}
          onRemove={() => {
            setSource(null);
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
