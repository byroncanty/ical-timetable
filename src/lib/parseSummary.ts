export const ACTIVITY_LABELS: Record<string, string> = {
  LEC: 'Lecture',
  TUT: 'Tutorial',
  PRA: 'Practical',
  LAB: 'Lab',
  WRK: 'Workshop',
  SEM: 'Seminar',
};

export const activityLabel = (code: string) => ACTIVITY_LABELS[code] ?? code;

export interface ParsedSummary {
  unitCode: string;
  unitShortName: string;
  activity: string;
  activityLabel: string;
  group: string;
}

// University feeds (e.g. RMIT myTimetable): "ICTPRG430 AppInroOOPLangSkills, LEC01".
// Unit code = letters then 3–4 digits, possibly glued to the name ("ICTNWK420InstallCong…").
const UNIT_RE = /^([A-Z]{3,}\d{3,4})(?=\D|$)\s*(.*)$/;
const ACTIVITY_RE = /^([A-Za-z]{2,4})\s*(\d{1,3})$/;

/**
 * "ICTPRG430 AppInroOOPLangSkills\, LEC01" → unit, name, activity and group.
 * Anything else ("Team standup", "Maths 101, Room 3") is an ordinary event: the whole title is the unit.
 */
export function parseSummary(summary: string): ParsedSummary {
  const s = summary.replace(/\\,/g, ',').replace(/\s+/g, ' ').trim();
  const comma = s.lastIndexOf(',');
  const head = (comma >= 0 ? s.slice(0, comma) : s).trim();
  const tail = (comma >= 0 ? s.slice(comma + 1) : '').trim();

  const unit = head.match(UNIT_RE);
  const act = tail.match(ACTIVITY_RE);
  if (unit && (act || !tail)) {
    const activity = act ? act[1].toUpperCase() : '';
    return { unitCode: unit[1], unitShortName: unit[2].trim(), activity, activityLabel: activity ? activityLabel(activity) : '', group: act?.[2] ?? '' };
  }
  return { unitCode: s || 'Untitled event', unitShortName: '', activity: '', activityLabel: '', group: '' };
}

/**
 * DESCRIPTION lines: "COSC7391C_2601_3150_AUSCY, LEC01, 01" / "<unit name>" / "Staff: -" / "Location: -".
 * The offering code ends in the campus code (AUSCY = City campus).
 */
export function parseDescription(description: string): { courseCode?: string; campusCode?: string; staff: string | null } {
  const lines = description.replace(/\\n/g, '\n').replace(/\\,/g, ',').split(/\r?\n/);
  const first = lines[0]?.split(',')[0]?.trim() ?? '';
  const isOffering = /^[A-Z]{3,}\d/.test(first);
  const parts = first.split('_');
  const courseCode = isOffering ? parts[0] : undefined;
  const campusCode = isOffering && parts.length > 1 && /^[A-Z]{4,6}$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : undefined;
  const staffLine = lines.find((l) => /^staff:/i.test(l.trim()));
  const staffValue = staffLine?.split(':').slice(1).join(':').trim() ?? '';
  return { courseCode, campusCode, staff: staffValue && staffValue !== '-' ? staffValue : null };
}
