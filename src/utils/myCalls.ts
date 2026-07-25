/**
 * Single source of truth for "my call" markers on the board.
 *
 * A player is one of your calls ONLY when a saved rating exists and it is
 * not 50 (50 = aligned with Franco). Unrated players have no saved value
 * ('' or null) and must never render an influence chip; note Number('') is 0,
 * so naive `Number(value) < 50` checks false-flag every unrated player.
 */
export function isMyCallValue(value: string | null | undefined) {
  if (value == null || value === '') return false;
  const num = Number(value);
  return Number.isFinite(num) && num !== 50;
}

export function myCallDirection(value: string | null | undefined) {
  if (!isMyCallValue(value)) return null;
  return Number(value) > 50 ? 'up' : 'down';
}

export function myCallLabel(value: string | null | undefined) {
  const direction = myCallDirection(value);
  if (!direction) return null;
  return direction === 'up' ? 'YOU ▲' : 'YOU ▼';
}
