// Friendly names for the truncated unit names in the feed. Users can override these in the app.
export const DEFAULT_UNIT_NAMES: Record<string, string> = {
  ICTPRG430: 'Apply Intro OOP Language Skills',
  BSBXCS402: 'Promote Workplace Cyber Security Awareness',
  ICTNWK542: 'Install, Operate & Troubleshoot Medium Enterprise Routers',
  ICTNWK420: 'Install & Configure Virtual Machines',
  ICTSAS527: 'Manage Client Problems',
};

// Well-separated OKLCH hues; cards derive light/dark shades from these in CSS.
const HUES = [255, 155, 25, 305, 70, 195, 345, 120, 220, 0];

function hashHue(code: string): number {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** Stable colour per unit: units are hashed, and collisions bump to the next free hue. */
export function buildHueMap(unitCodes: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  for (const code of [...new Set(unitCodes)].sort()) {
    let idx = HUES.indexOf(hashHue(code));
    for (let tries = 0; tries < HUES.length && used.has(HUES[idx]); tries++) idx = (idx + 1) % HUES.length;
    map[code] = HUES[idx];
    used.add(HUES[idx]);
  }
  return map;
}

export const hueOf = (map: Record<string, number>, code: string) => map[code] ?? hashHue(code);
