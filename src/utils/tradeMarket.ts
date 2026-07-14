import type { LeagueBootstrap, MarketMover } from '../services/leagueApi';

const DISMISSED_TRADES_KEY = 'og.market.dismissed-trades';

type DismissedTradeStore = {
  leagueId: string;
  week: number;
  signatures: string[];
};

type DismissedTradeMap = Record<string, DismissedTradeStore>;

function sortedIds(ids: string[]) {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

function readStore() {
  try {
    const raw = window.localStorage.getItem(DISMISSED_TRADES_KEY);
    return raw ? (JSON.parse(raw) as DismissedTradeMap) : {};
  } catch {
    return {};
  }
}

function writeStore(store: DismissedTradeMap) {
  try {
    window.localStorage.setItem(DISMISSED_TRADES_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}

export function marketMoverPlayerIds(mover: MarketMover) {
  return {
    givePlayerIds: mover.givePlayerIds ?? (mover.givePlayerId ? [mover.givePlayerId] : []),
    getPlayerIds: mover.getPlayerIds ?? (mover.getPlayerId ? [mover.getPlayerId] : []),
  };
}

export function tradeSignature({
  leagueId,
  partnerRosterId,
  givePlayerIds,
  getPlayerIds,
}: {
  leagueId: string;
  partnerRosterId: number;
  givePlayerIds: string[];
  getPlayerIds: string[];
}) {
  return [
    leagueId,
    String(partnerRosterId),
    sortedIds(givePlayerIds).join(','),
    sortedIds(getPlayerIds).join(','),
  ].join('::');
}

export function marketMoverSignature(leagueId: string, mover: MarketMover) {
  if (mover.kind !== 'trade' || mover.partnerRosterId == null) return null;
  const { givePlayerIds, getPlayerIds } = marketMoverPlayerIds(mover);
  if (givePlayerIds.length === 0 || getPlayerIds.length === 0) return null;
  return tradeSignature({
    leagueId,
    partnerRosterId: mover.partnerRosterId,
    givePlayerIds,
    getPlayerIds,
  });
}

export function samePositionOneForOneTrade(
  mover: Pick<MarketMover, 'givePlayerId' | 'givePlayerIds' | 'getPlayerId' | 'getPlayerIds'>,
  players: LeagueBootstrap['players'],
) {
  const { givePlayerIds, getPlayerIds } = marketMoverPlayerIds(mover as MarketMover);
  if (givePlayerIds.length !== 1 || getPlayerIds.length !== 1) return false;
  const givePosition = players[givePlayerIds[0]]?.position;
  const getPosition = players[getPlayerIds[0]]?.position;
  return Boolean(givePosition && getPosition && givePosition === getPosition);
}

export function readDismissedTradeSignatures(leagueId: string, week: number) {
  const store = readStore();
  const entry = store[leagueId];
  if (!entry || entry.week !== week) {
    if (entry && entry.week !== week) {
      delete store[leagueId];
      writeStore(store);
    }
    return new Set<string>();
  }
  return new Set(entry.signatures);
}

export function writeDismissedTradeSignatures(
  leagueId: string,
  week: number,
  signatures: Iterable<string>,
) {
  const store = readStore();
  const nextSignatures = [...new Set(signatures)].sort((left, right) => left.localeCompare(right));
  if (nextSignatures.length === 0) {
    delete store[leagueId];
  } else {
    store[leagueId] = {
      leagueId,
      week,
      signatures: nextSignatures,
    };
  }
  writeStore(store);
}

export function dismissTradeSignature(leagueId: string, week: number, signature: string) {
  const signatures = readDismissedTradeSignatures(leagueId, week);
  signatures.add(signature);
  writeDismissedTradeSignatures(leagueId, week, signatures);
  return signatures;
}

export function restoreTradeSignature(leagueId: string, week: number, signature: string) {
  const signatures = readDismissedTradeSignatures(leagueId, week);
  signatures.delete(signature);
  writeDismissedTradeSignatures(leagueId, week, signatures);
  return signatures;
}

export function clearDismissedTradeSignatures(leagueId: string, week: number) {
  writeDismissedTradeSignatures(leagueId, week, []);
  return new Set<string>();
}
