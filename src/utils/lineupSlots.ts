/**
 * Which starter sits in which slot, for display.
 *
 * Both providers drop a slot nobody filled. Sleeper strips the '0' placeholder
 * out of `starters`; ESPN simply has no entry for an empty lineup spot. The app
 * then labelled starters by their position in that array, so a manager whose
 * quarterback was on bye saw his running back sitting in the QB row, every row
 * below it shifted up one, and a "no starter" row stranded at the bottom under
 * the kicker. Nothing was wrong with the numbers; the labels had slid.
 *
 * So the slot is worked out from the player rather than counted off. Walk the
 * league's own slot order, and give each slot the first starter it accepts.
 *
 * Two passes, because a slot that takes one position has no choice and a flex
 * does. Strict slots claim first, flex fills from what is left; otherwise a
 * league that lists its flex before its running backs would hand the flex a
 * running back and leave RB2 empty. In canonical order a single greedy pass
 * gets the same answer, and this one does not depend on the order being
 * canonical.
 *
 * Display only. The engine does its own assignment for pricing; this exists so
 * the rows on screen read like the lineup the manager actually set.
 */

export const SLOT_ELIGIBILITY: Record<string, readonly string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLX: ['RB', 'WR', 'TE'],
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};

export function slotAccepts(slotLabel: string, position: string | null | undefined) {
  if (!position) return false;
  const accepted = SLOT_ELIGIBILITY[slotLabel.toUpperCase()];
  /* An unmapped slot (a bench row, a league with a custom slot) should not
     silently block everything, so it accepts anything. */
  if (!accepted) return true;
  return accepted.includes(position.toUpperCase());
}

function isStrict(slotLabel: string) {
  return (SLOT_ELIGIBILITY[slotLabel.toUpperCase()]?.length ?? 99) === 1;
}

export interface SlotAssignment<T> {
  slotLabel: string;
  /** Null when the manager left this slot empty, or his only option is on bye. */
  starter: T | null;
}

/**
 * One entry per slot, in the league's order.
 *
 * Every starter lands somewhere: anybody the slots could not take (an unknown
 * position, more starters than slots) is appended rather than dropped, because
 * a player vanishing off the screen is a worse bug than a player in an odd row.
 */
export function assignStartersToSlots<T>(
  starters: readonly T[],
  slotLabels: readonly string[],
  positionOf: (starter: T) => string | null | undefined,
): SlotAssignment<T>[] {
  const pool = starters.map((starter, index) => ({ starter, index, taken: false }));
  const assigned = new Array<T | null>(slotLabels.length).fill(null);

  const claim = (slotIndex: number) => {
    const label = slotLabels[slotIndex];
    const match = pool.find((entry) => !entry.taken && slotAccepts(label, positionOf(entry.starter)));
    if (!match) return;
    match.taken = true;
    assigned[slotIndex] = match.starter;
  };

  slotLabels.forEach((label, index) => { if (isStrict(label)) claim(index); });
  slotLabels.forEach((label, index) => { if (!isStrict(label)) claim(index); });

  const rows: SlotAssignment<T>[] = slotLabels.map((slotLabel, index) => ({
    slotLabel,
    starter: assigned[index],
  }));

  /* Anyone the slots refused. Put them in the first empty slot if there is one,
     and otherwise on the end: wrong row beats missing. */
  for (const entry of pool) {
    if (entry.taken) continue;
    const empty = rows.find((row) => row.starter == null);
    if (empty) empty.starter = entry.starter;
    else rows.push({ slotLabel: positionOf(entry.starter) ?? 'FLEX', starter: entry.starter });
  }

  return rows;
}
