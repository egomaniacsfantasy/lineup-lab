export function formatAmericanOdds(odds: number): string {
  const rounded = Math.round(odds);

  if (rounded >= 100) {
    return `+${rounded}`;
  }

  if (rounded <= -100) {
    return `${rounded}`;
  }

  return 'EVEN';
}

export function formatSpread(spread: number): string {
  const rounded = Math.round(spread * 10) / 10;

  if (rounded > 0) {
    return `+${rounded.toFixed(1)}`;
  }

  return rounded.toFixed(1);
}
