import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { campusName, directionsUrl } from '../lib/delivery';
import { durationLabel, fmt, fmtTime, timeRange } from '../lib/time';
import type { TimetableEvent } from '../lib/types';
import { isTermLike, teachingWeek, type TermInfo } from '../lib/weeks';
import { ModeBadge, hasCode, pillClass } from './EventCard';
import { X } from './icons';

interface Props {
  event: TimetableEvent;
  allEvents: TimetableEvent[];
  term: TermInfo | null;
  hue: number;
  now: Date;
  typical: boolean; // opened from the typical-week view
  onClose: () => void;
  onJump: (e: TimetableEvent) => void;
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[7rem_1fr] gap-3 py-2">
    <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="text-sm font-medium break-words">{children}</dd>
  </div>
);

export function EventDrawer({ event: e, allEvents, term, hue, now, typical, onClose, onJump }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sessions = allEvents.filter((x) => x.classKey === e.classKey);
  // Daily or long-running events can have hundreds of sessions: list 40 around this one.
  const MAX_LISTED = 40;
  const at = Math.max(0, sessions.findIndex((x) => x.uid === e.uid));
  const from = Math.max(0, Math.min(at - 8, sessions.length - MAX_LISTED));
  const listed = sessions.slice(from, from + MAX_LISTED);
  const showWeeks = !!term && isTermLike(term);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="animate-drawer-in relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl dark:bg-zinc-900" style={{ '--h': hue } as CSSProperties}>
        <header className="unit-band px-6 pt-5 pb-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-h-6 items-center gap-2">
              {hasCode(e) && <span className="text-sm font-bold tracking-tight">{e.unitCode}</span>}
              {e.activity && (
                <span className="rounded-full bg-white/20 px-2 text-xs font-semibold">
                  {e.activityLabel} {e.group}
                </span>
              )}
            </div>
            <button ref={closeRef} type="button" onClick={onClose} className="-m-1.5 rounded-lg p-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white" aria-label="Close">
              <X />
            </button>
          </div>
          <h2 id="drawer-title" className="mt-3 text-xl leading-snug font-semibold">
            {e.unitName}
          </h2>
          <p className="mt-1 text-sm text-white/85">
            {typical ? `Every ${fmt(e.start, 'EEEE')}` : fmt(e.start, 'EEEE d MMMM yyyy')} · {timeRange(e.startMin, e.endMin)}
          </p>
        </header>

        <div className="px-6 py-4">
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <Row label="Delivery">
              <span className="inline-flex items-center gap-2">
                <ModeBadge mode={e.mode} size="md" />
                {e.mode === 'online' && e.place}
              </span>
            </Row>
            {e.mode === 'online' ? (
              e.joinUrl && (
                <Row label="Link">
                  <a href={e.joinUrl} target="_blank" rel="noreferrer" className="break-all text-indigo-600 hover:underline dark:text-indigo-400">
                    {e.joinUrl.replace(/^https?:\/\//, '').slice(0, 60)}
                    {e.joinUrl.length > 68 ? '…' : ''} ↗
                  </a>
                </Row>
              )
            ) : (
              <>
                {campusName(e.campusCode) && (
                  <Row label="Campus">
                    {campusName(e.campusCode)}
                    <span className="ml-2 font-mono text-xs text-zinc-500">{e.campusCode}</span>
                  </Row>
                )}
                <Row label={e.room ? 'Room' : 'Location'}>
                  {e.room?.label ?? e.location ?? 'Not set'}
                  {e.room && <span className="ml-2 font-mono text-xs text-zinc-500">{e.location}</span>}
                  {directionsUrl(e) && (
                    <a href={directionsUrl(e)} target="_blank" rel="noreferrer" className="ml-2 text-indigo-600 hover:underline dark:text-indigo-400">
                      Directions ↗
                    </a>
                  )}
                </Row>
              </>
            )}
            <Row label="Duration">{durationLabel(e.endMin - e.startMin)}</Row>
            {e.activity && (
              <Row label="Activity">
                <span className="unit-card inline-flex rounded-md px-1.5">
                  <span className={pillClass(e.activity)}>{e.activity}</span>
                </span>{' '}
                {e.activityLabel}, group {e.group || '—'}
              </Row>
            )}
            {!typical && showWeeks && <Row label="Week">Week {teachingWeek(e.weekKey, term!)}</Row>}
            {e.staff && <Row label="Staff">{e.staff}</Row>}
            {e.courseCode && <Row label="Course code">{e.courseCode}</Row>}
            {e.unitShortName && <Row label="Feed name">{e.unitShortName}</Row>}
          </dl>

          <h3 className="mt-6 mb-2 text-sm font-semibold">
            All sessions{' '}
            <span className="font-normal text-zinc-500">({listed.length < sessions.length ? `showing ${listed.length} of ${sessions.length}` : sessions.length})</span>
          </h3>
          <ol className="grid grid-cols-2 gap-1.5 text-sm">
            {listed.map((s) => {
              const past = s.end < now;
              const current = s.uid === e.uid && !typical;
              return (
                <li key={s.uid}>
                  <button
                    type="button"
                    onClick={() => onJump(s)}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left tabular-nums transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${current ? 'unit-card ring-1 ring-current' : ''} ${past && !current ? 'text-zinc-400 dark:text-zinc-500' : ''}`}
                  >
                    {showWeeks && <span className="mr-1.5 text-xs opacity-60">W{teachingWeek(s.weekKey, term!)}</span>}
                    {fmt(s.start, 'EEE d MMM')}
                    {(s.startMin !== e.startMin || s.weekday !== e.weekday) && <span className="ml-1 text-xs text-amber-600">{fmtTime(s.start)}</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <h3 className="mt-6 mb-2 text-sm font-semibold">Raw feed data</h3>
          <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs leading-relaxed whitespace-pre-wrap text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {`SUMMARY: ${e.raw.summary}\nLOCATION: ${e.location ?? '-'}\n\n${e.raw.description}`}
          </pre>
        </div>
      </aside>
    </div>
  );
}
