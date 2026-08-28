export type AcceptanceLingoTone = 'bad' | 'neutral' | 'good';

export interface AcceptanceLingoBand {
  min: number;
  max: number;
  label: string;
  tone: AcceptanceLingoTone;
}

export const ACCEPTANCE_LINGO_BANDS = [
  { min: 0, max: 9, label: 'Long shot', tone: 'bad' },
  { min: 10, max: 29, label: 'Unlikely', tone: 'bad' },
  { min: 30, max: 44, label: 'Doubtful', tone: 'bad' },
  { min: 45, max: 55, label: 'Coin flip', tone: 'neutral' },
  { min: 56, max: 69, label: 'Likely', tone: 'good' },
  { min: 70, max: 84, label: 'Favored', tone: 'good' },
  { min: 85, max: 100, label: 'Near lock', tone: 'good' },
] as const satisfies readonly AcceptanceLingoBand[];

/**
 * The lowest acceptance a trade can have and still be worth suggesting.
 *
 * Defined here because this module owns what acceptance means. The two bands
 * below this one are the ones a manager laughs at, and a list of those is not
 * a list of suggestions — see dealBoardPolicy, which is the only caller.
 *
 * Derived from the bands rather than typed as a bare 30, so the threshold and
 * the word printed beside it cannot drift apart: it is the floor of the first
 * band above the two worst.
 */
export const MIN_SUGGESTABLE_ACCEPTANCE =
  ACCEPTANCE_LINGO_BANDS.filter((band) => band.tone === 'bad').at(-1)?.min ?? 30;

function clampAcceptanceProbability(probability: number) {
  return Math.max(0, Math.min(100, probability));
}

export function displayedAcceptanceProbability(probability: number | null | undefined) {
  if (probability == null || !Number.isFinite(probability)) return null;
  return Math.round(clampAcceptanceProbability(probability));
}

export function getAcceptanceLingo(probability: number | null | undefined) {
  const pct = displayedAcceptanceProbability(probability);
  if (pct == null) return null;
  return (
    ACCEPTANCE_LINGO_BANDS.find((band) => pct >= band.min && pct <= band.max) ??
    ACCEPTANCE_LINGO_BANDS[ACCEPTANCE_LINGO_BANDS.length - 1]
  );
}

export function formatAcceptancePercent(probability: number | null | undefined) {
  const pct = displayedAcceptanceProbability(probability);
  if (pct == null) return null;
  return `${pct}%`;
}

export function formatAcceptanceRead(probability: number | null | undefined) {
  const band = getAcceptanceLingo(probability);
  const pct = formatAcceptancePercent(probability);
  if (!band || !pct) return null;
  return `${pct} · ${band.label}`;
}

export function formatAcceptanceSentence(probability: number | null | undefined) {
  const read = formatAcceptanceRead(probability);
  if (!read) return null;
  return `Acceptance read: ${read}.`;
}
