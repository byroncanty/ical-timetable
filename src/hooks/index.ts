import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from '../lib/storage';

/** State mirrored to localStorage (a per-viewer convenience; works without storage too). */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJSON(key, initial));
  useEffect(() => writeJSON(key, value), [key, value]);
  return [value, setValue] as const;
}

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    // Some environments (zoom, device emulation) skip 'change', so re-check on resize too.
    mq.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [query]);
  return matches;
}

export type ThemePref = 'light' | 'dark' | 'system';

export function useTheme() {
  const [pref, setPref] = useLocalState<ThemePref>('ical-timetable:theme', 'system');
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const dark = pref === 'dark' || (pref === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const toggle = useCallback(() => setPref(dark ? 'light' : 'dark'), [dark, setPref]);
  return { dark, toggle };
}
