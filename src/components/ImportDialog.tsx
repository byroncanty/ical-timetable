import { useEffect, useRef, useState, type FormEvent } from 'react';
import { sourceLabel, type Source } from '../lib/feed';
import { CalendarPlus, Spinner, Upload, X } from './icons';

interface Props {
  current: Source | null;
  onImportUrl: (url: string) => Promise<void>; // throws with a readable message
  onImportFile: (name: string, text: string) => Promise<void>;
  onSample: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ImportDialog({ current, onImportUrl, onImportFile, onSample, onRemove, onClose }: Props) {
  const [url, setUrl] = useState(current?.kind === 'url' ? current.url : '');
  const [busy, setBusy] = useState<'url' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const run = async (kind: 'url' | 'file', task: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const link = url.trim();
    if (!/^(https?|webcals?):\/\/\S+$/i.test(link)) return setError('Paste the full calendar link, starting with https:// or webcal://');
    run('url', () => onImportUrl(link));
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    run('file', async () => {
      const text = await file.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error("That file isn't an iCal (.ics) calendar.");
      await onImportFile(file.name, text);
    });
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <CalendarPlus width={20} height={20} />
            </span>
            <div>
              <h2 id="import-title" className="text-lg font-semibold">
                Import calendar
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Fill the timetable from any iCal (.ics) calendar.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="-m-1 rounded-lg p-1.5 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800" aria-label="Close">
            <X />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="ical-url" className="text-sm font-medium">
            Calendar link
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              id="ical-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://…/calendar.ics or webcal://…"
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-transparent px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none dark:border-zinc-700"
            />
            <button type="submit" disabled={!!busy} className="btn-primary justify-center px-5 py-2.5 disabled:opacity-60">
              {busy === 'url' ? <Spinner width={16} height={16} /> : <CalendarPlus width={16} height={16} />}
              {busy === 'url' ? 'Importing…' : 'Import'}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            The link is saved only in this browser, and the timetable re-checks it every 10 minutes. It's passed to a small fetcher just to download the
            calendar, because most calendar sites block direct downloads from other websites.
          </p>
        </form>

        <details className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-800/50">
          <summary className="cursor-pointer font-medium">Where do I find my iCal link?</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-zinc-600 dark:text-zinc-300">
            <li>
              <strong>Uni timetable (e.g. RMIT myTimetable):</strong> look for a Subscribe or calendar-sync option and copy the iCal link.
            </li>
            <li>
              <strong>Google Calendar:</strong> Settings → pick the calendar → Integrate calendar → <em>Secret address in iCal format</em>.
            </li>
            <li>
              <strong>Outlook:</strong> Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.
            </li>
            <li>
              <strong>iCloud:</strong> in the Calendar app, share the calendar as a Public Calendar and copy the link.
            </li>
          </ul>
        </details>

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <div className="flex flex-wrap gap-2">
          <label className={`btn cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy === 'file' ? <Spinner width={16} height={16} /> : <Upload width={16} height={16} />}
            Upload .ics file
            <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn" disabled={!!busy} onClick={onSample}>
            Try the sample timetable
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        )}

        {current && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400">
              Showing: <span className="font-medium text-zinc-700 dark:text-zinc-200">{sourceLabel(current)}</span>
            </span>
            <button type="button" disabled={!!busy} onClick={onRemove} className="font-medium text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400">
              Remove calendar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
