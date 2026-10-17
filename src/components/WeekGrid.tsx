import { forwardRef, type CSSProperties } from 'react';
import { layoutDay } from '../lib/layout';
import { hourLabel } from '../lib/time';
import type { GridItem } from '../lib/types';
import { EventCard } from './EventCard';

export interface DayColumn {
  weekday: number; // 1 = Monday … 7 = Sunday
  label: string; // "Mon"
  sub?: string; // "8 Sep"
  isToday: boolean;
}

interface Props {
  items: GridItem[];
  days: DayColumn[];
  range: { start: number; end: number };
  nowMin: number | null; // shown on today's column
  hueFor: (unitCode: string) => number;
  onSelect: (item: GridItem) => void;
  animKey: string;
  dir: number;
}

const px = (min: number) => `calc(var(--ppm) * ${min})`;

export const WeekGrid = forwardRef<HTMLDivElement, Props>(function WeekGrid({ items, days, range, nowMin, hueFor, onSelect, animKey, dir }, ref) {
  const hours: number[] = [];
  for (let m = Math.ceil(range.start / 60) * 60; m <= range.end; m += 60) hours.push(m);
  const total = range.end - range.start;
  const cols: CSSProperties = { gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` };

  return (
    <div ref={ref} className="print-flat overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div style={cols} className={`grid sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90`}>
        <div />
        {days.map((d) => (
          <div key={d.weekday} className="border-l border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
            <div className={`text-xs font-semibold tracking-wide uppercase ${d.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'}`}>{d.label}</div>
            {d.sub && (
              <div className={`mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold ${d.isToday ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                {d.isToday && <span className="size-1.5 rounded-full bg-indigo-500" />}
                {d.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      <div key={animKey} className="animate-week-in relative grid" style={{ ...cols, height: px(total), '--dir': dir } as CSSProperties}>
        {/* time gutter */}
        <div className="relative">
          {hours.map((m) => (
            <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500" style={{ top: px(m - range.start) }}>
              {m > range.start && m < range.end && hourLabel(m)}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const dayItems = items.filter((i) => i.weekday === d.weekday);
          return (
            <div key={d.weekday} className={`relative border-l border-zinc-100 dark:border-zinc-800 ${d.isToday ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
              {hours.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800/80" style={{ top: px(m - range.start) }} />
              ))}
              {hours.slice(0, -1).map((m) => (
                <div key={`h${m}`} className="absolute inset-x-0 border-t border-dashed border-zinc-100/70 dark:border-zinc-800/40" style={{ top: px(m + 30 - range.start) }} />
              ))}

              {layoutDay(dayItems).map(({ item, col, cols }) => (
                <EventCard
                  key={item.id}
                  item={item}
                  hue={hueFor(item.event.unitCode)}
                  onSelect={onSelect}
                  className="absolute z-10"
                  style={{
                    top: `calc(${px(item.startMin - range.start)} + 1px)`,
                    height: `calc(${px(item.endMin - item.startMin)} - 3px)`,
                    left: `calc(${(col / cols) * 100}% + 3px)`,
                    width: `calc(${100 / cols}% - 6px)`,
                  }}
                />
              ))}

              {d.isToday && nowMin != null && nowMin >= range.start && nowMin <= range.end && (
                <div className="pointer-events-none absolute inset-x-0 z-30 no-print" style={{ top: px(nowMin - range.start) }} aria-hidden>
                  <div className="relative h-0.5 bg-rose-500">
                    <span className="absolute -top-[5px] -left-[5px] size-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-900" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
