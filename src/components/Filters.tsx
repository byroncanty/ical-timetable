import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { activityLabel } from '../lib/parseSummary';
import { Filter } from './icons';

export interface UnitInfo {
  code: string;
  shortName: string;
  defaultName: string;
}

interface Props {
  units: UnitInfo[];
  activities: string[];
  hiddenUnits: string[];
  hiddenActivities: string[];
  names: Record<string, string>; // user overrides
  hueFor: (code: string) => number;
  onToggleUnit: (code: string) => void;
  onToggleActivity: (code: string) => void;
  onRename: (code: string, name: string) => void;
  onReset: () => void;
}

export function Filters(p: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeCount = p.hiddenUnits.length + p.hiddenActivities.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn">
        <Filter width={16} height={16} />
        <span className="hidden sm:inline">Units</span>
        {activeCount > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">{activeCount} hidden</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Units</h3>
            <button type="button" onClick={p.onReset} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
              Reset names & filters
            </button>
          </div>
          <ul className="space-y-2">
            {p.units.map((u) => {
              const shown = !p.hiddenUnits.includes(u.code);
              return (
                <li key={u.code} className="flex items-center gap-2" style={{ '--h': p.hueFor(u.code) } as CSSProperties}>
                  <input
                    type="checkbox"
                    checked={shown}
                    onChange={() => p.onToggleUnit(u.code)}
                    aria-label={`Show ${u.code}`}
                    className="size-4 shrink-0 accent-indigo-600"
                  />
                  <span className="unit-dot size-2.5 shrink-0 rounded-full" />
                  <span title={u.code} className={`w-20 shrink-0 truncate text-xs font-bold ${shown ? '' : 'opacity-40'}`}>{u.code}</span>
                  <input
                    type="text"
                    value={p.names[u.code] ?? u.defaultName}
                    placeholder={u.shortName}
                    onChange={(e) => p.onRename(u.code, e.target.value)}
                    aria-label={`Name for ${u.code}`}
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none dark:border-zinc-700"
                  />
                </li>
              );
            })}
          </ul>

          <h3 className="mt-4 mb-2 text-sm font-semibold">Activity types</h3>
          <div className="flex flex-wrap gap-1.5">
            {p.activities.map((a) => {
              const shown = !p.hiddenActivities.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={shown}
                  onClick={() => p.onToggleActivity(a)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${shown ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-zinc-300 text-zinc-500 dark:border-zinc-700'}`}
                >
                  {activityLabel(a)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
