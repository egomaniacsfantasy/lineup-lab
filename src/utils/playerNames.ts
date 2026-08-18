/**
 * How a player's name reads in a row.
 *
 * A defense was carrying its full franchise name — "San Francisco 49ers" —
 * into rows sized for "B. Robinson", where it ran 8px past the column and got
 * an ellipsis. Every NFL nickname is a single word and the row already says
 * DEF beside a team logo, so the nickname is the name here: unambiguous, and
 * it fits.
 */
export function personShortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export function defenseShortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.at(-1) || fullName;
}

export function playerShortName(fullName: string, position: string | null | undefined) {
  return position === 'DEF' ? defenseShortName(fullName) : personShortName(fullName);
}

/**
 * Injury status, short enough for a lineup row.
 *
 * "vs NYG · Questionable" does not fit the compact meta line on a phone, so it
 * arrived as "vs NYG · Questiona...". Every fantasy product on the market
 * writes these as a letter for exactly this reason, and a Q beside a player is
 * not less information than "Questiona..." — it is the same information, whole.
 */
const STATUS_SHORT: Record<string, string> = {
  questionable: 'Q',
  doubtful: 'D',
  out: 'OUT',
  ir: 'IR',
  'injured reserve': 'IR',
  suspended: 'SUS',
  pup: 'PUP',
  probable: 'P',
  'day-to-day': 'DTD',
  'day to day': 'DTD',
};

export function shortInjuryStatus(status: string | null | undefined) {
  if (!status) return null;
  const key = status.trim().toLowerCase();
  return STATUS_SHORT[key] ?? status.trim();
}
