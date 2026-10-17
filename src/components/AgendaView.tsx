import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { minToLabel } from '../lib/time';
import type { GridItem } from '../lib/types';
import { ActivityPill, ModeBadge, WhereTag, ariaLabel, cardClass, hasCode } from './EventCard';

export interface AgendaDay {
  weekday: number;
  label: string; // "Monday"
  short: string; // "Mon"
  sub?: string; // "8 Sep"
  isToday: boolean;
  items: GridItem[];
}

interface Props {
  days: AgendaDay[];
  single: boolean; // mobile: one day at a time with tabs + swipe
  hueFor: (unitCode: string) => number;
  onSelect: (item: GridItem) => void;
  onEdge?: (dir: -1 | 1) => void; // swiping past Mon/Thu moves the week
  animKey: string;
}

function DayList({ day, hueFor, onSelect }: { day: AgendaDay; hueFor: Props['hueFor']; onSelect: Props['onSelect'] }) {
  const items = [...day.items].sort((a, b) => a.startMin - b.startMin);
  if (!items.length) return <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">No classes</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const e = item.event;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-label={ariaLabel(item)}
              style={{ '--h': hueFor(e.unitCode) } as CSSProperties}
              className={`${cardClass(e.mode)} @container flex w-full gap-3 rounded-xl border-l-4 p-3 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500 dark:ring-white/10`}
            >
              <div className="w-[4.75rem] shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">
                {minToLabel(item.startMin)}
                <div className="text-xs font-normal opacity-70">{minToLabel(item.endMin)}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate text-sm font-bold">{hasCode(e) ? e.unitCode : e.unitName}</span>
                  {e.activity && <ActivityPill event={e} />}
                  {item.badge && <span className="shrink-0 rounded bg-amber-400/90 px-1 text-[10px] font-semibold text-amber-950">{item.badge}</span>}
                  <ModeBadge mode={e.mode} className="ml-auto" />
                </div>
                {hasCode(e) && <div className="truncate text-sm font-medium">{e.unitName}</div>}
                <div className="mt-0.5 flex min-w-0 text-xs opacity-80">
                  <WhereTag event={e} className="font-medium" />
                </div>
                {item.subtitle && <div className="text-xs opacity-70">{item.subtitle}</div>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AgendaView({ days, single, hueFor, onSelect, onEdge, animKey }: Props) {
  const defaultIdx = () => {
    const today = days.findIndex((d) => d.isToday);
    if (today >= 0) return today;
    const withClasses = days.findIndex((d) => d.items.length);
    return withClasses >= 0 ? withClasses : 0;
  };
  const [idx, setIdx] = useState(defaultIdx);
  const touchX = useRef<number | null>(null);

  // Reset the selected day when the week changes.
  useEffect(() => setIdx(defaultIdx()), [animKey]);

  if (!single) {
    return (
      <div key={animKey} className="animate-week-in space-y-6">
        {days.map((d) => (
          <section key={d.weekday} aria-label={d.label}>
            <h2 className={`mb-2 flex items-baseline gap-2 text-sm font-semibold ${d.isToday ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
              {d.label}
              {d.sub && <span className="font-normal text-zinc-500 dark:text-zinc-400">{d.sub}</span>}
              {d.isToday && <span className="rounded-full bg-indigo-100 px-2 text-xs text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">Today</span>}
            </h2>
            <DayList day={d} hueFor={hueFor} onSelect={onSelect} />
          </section>
        ))}
      </div>
    );
  }

  const go = (delta: -1 | 1) => {
    const next = idx + delta;
    if (next < 0 || next >= days.length) onEdge?.(delta);
    else setIdx(next);
  };
  const day = days[Math.min(idx, days.length - 1)];

  return (
    <div
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div role="tablist" aria-label="Day" className="mb-4 grid gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <button
            key={d.weekday}
            role="tab"
            aria-selected={i === idx}
            onClick={() => setIdx(i)}
            className={`relative rounded-lg py-1.5 text-center text-xs font-medium transition ${i === idx ? 'bg-white shadow-sm dark:bg-zinc-800' : 'text-zinc-500 dark:text-zinc-400'}`}
          >
            <div className={d.isToday ? 'text-indigo-600 dark:text-indigo-400' : ''}>{d.short}</div>
            {d.sub && <div className="text-[11px] opacity-70">{d.sub.split(' ')[0]}</div>}
            {d.items.length > 0 && <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-indigo-400" />}
          </button>
        ))}
      </div>
      <div key={`${animKey}-${idx}`} className="animate-week-in">
        <DayList day={day} hueFor={hueFor} onSelect={onSelect} />
      </div>
    </div>
  );
}
