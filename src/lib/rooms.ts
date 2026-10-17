import type { Room } from './types';

/** "-" or empty means no room has been allocated. */
export function normaliseLocation(location: string | null | undefined): string | null {
  const l = (location ?? '').trim();
  return l && l !== '-' ? l : null;
}

/** RMIT room codes: "057.06.002" → Building #57, Level 6, Room 002. */
export function parseRoom(location: string | null | undefined): Room | undefined {
  const l = normaliseLocation(location);
  const m = l?.match(/^(\d{1,3})\.(\d{1,2})\.([0-9A-Za-z]+)$/);
  if (!m) return undefined;
  const building = String(Number(m[1]));
  const level = String(Number(m[2]));
  const room = m[3];
  return {
    building,
    level,
    room,
    name: `Building #${building}`,
    label: `Building #${building} · Level ${level} · Room ${room}`,
    short: `B #${building} · L${level} · R${room}`,
  };
}
