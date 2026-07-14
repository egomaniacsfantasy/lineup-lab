export function showLineupPlayerPosition(slotLabel: string, tone: 'starter' | 'bench') {
  if (tone === 'bench') return true;
  return slotLabel !== 'FLX' ? false : false;
}
