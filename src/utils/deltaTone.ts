export function signedDeltaClass(value: number) {
  if (value > 0) return 'trade-cc__signed-value--positive';
  if (value < 0) return 'trade-cc__signed-value--negative';
  return 'trade-cc__signed-value--neutral';
}
