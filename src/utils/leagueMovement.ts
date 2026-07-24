export const MATERIAL_MOVE_POINTS = 1;

export function isMaterialMove(move: number) {
  return Math.abs(move) >= MATERIAL_MOVE_POINTS;
}

export function formatMovementLabel(move: number, timeframe: string) {
  const arrow = move >= 0 ? '▲' : '▼';
  return timeframe ? `${arrow} ${Math.abs(move).toFixed(1)} ${timeframe}` : `${arrow} ${Math.abs(move).toFixed(1)}`;
}
