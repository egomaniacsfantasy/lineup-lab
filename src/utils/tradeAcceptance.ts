const BAR0 = 0.6;
const K_FRIEND = 0.10;
const K_REL = 0.05;
const SPREAD = 1.5;

export function acceptanceProbability(theirDeltaTitle: number, friendliness: number, relationship: number) {
  const threshold = BAR0 - K_FRIEND * (friendliness - 5) - K_REL * (relationship - 5);
  const z = (theirDeltaTitle - threshold) / SPREAD;
  const p = 1 / (1 + Math.exp(-z));
  return Math.max(3, Math.min(97, Math.round(p * 100)));
}
