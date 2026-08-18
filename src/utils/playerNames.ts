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
