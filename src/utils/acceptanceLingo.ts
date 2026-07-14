export type AcceptanceLingoTone = 'bad' | 'neutral' | 'good';

export interface AcceptanceLingoBand {
  min: number;
  max: number;
  label: string;
  tone: AcceptanceLingoTone;
}

export const ACCEPTANCE_LINGO_BANDS = [
  { min: 0, max: 24, label: 'Long shot', tone: 'bad' },
  { min: 25, max: 44, label: 'Unlikely', tone: 'bad' },
  { min: 45, max: 59, label: 'Coin flip', tone: 'neutral' },
  { min: 60, max: 79, label: 'Likely', tone: 'good' },
  { min: 80, max: 100, label: 'Very likely', tone: 'good' },
] as const satisfies readonly AcceptanceLingoBand[];

function clampAcceptanceProbability(probability: number) {
  return Math.max(0, Math.min(100, probability));
}

export function getAcceptanceLingo(probability: number | null | undefined) {
  if (probability == null || !Number.isFinite(probability)) return null;
  const pct = clampAcceptanceProbability(probability);
  return (
    ACCEPTANCE_LINGO_BANDS.find((band) => pct >= band.min && pct <= band.max) ??
    ACCEPTANCE_LINGO_BANDS[ACCEPTANCE_LINGO_BANDS.length - 1]
  );
}

export function formatAcceptanceRead(probability: number | null | undefined) {
  const band = getAcceptanceLingo(probability);
  if (!band) return null;
  return `${probability}% · ${band.label}`;
}

export function formatAcceptanceSentence(probability: number | null | undefined) {
  const read = formatAcceptanceRead(probability);
  if (!read) return null;
  return `Acceptance read: ${read}.`;
}
