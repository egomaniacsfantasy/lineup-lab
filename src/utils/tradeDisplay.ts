import type { TradeAssetItem, TradeSideData } from '../components/trade-display/TradeDisplay';
import type { ApiCatalogPlayer, LeagueBootstrap, MarketMover } from '../services/leagueApi';
import type { Player } from '../types';
import type { SuggestedPackage } from '../mocks/tradeTargets';
import { toPlayer } from '../adapters/connectedLeague.ts';

function teamLogoUrl(team: string | null | undefined) {
  return team ? `/api/img/logo/${team.toLowerCase()}` : null;
}

export function tradeAssetFromPlayer(player: Player): TradeAssetItem {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    subtitle: player.team,
    headshotUrl: player.headshotUrl,
    teamLogoUrl: player.teamLogoUrl,
    kind: 'player',
  };
}

export function tradeAssetFromCatalogPlayer(
  id: string,
  catalog: Record<string, ApiCatalogPlayer>,
): TradeAssetItem {
  const entry = catalog[id];
  if (!entry) {
    return {
      id,
      name: 'Unknown player',
      position: null,
      subtitle: null,
      headshotUrl: null,
      teamLogoUrl: null,
      kind: 'player',
    };
  }
  return tradeAssetFromPlayer(toPlayer(id, catalog));
}

export function tradeSideFromIds(
  label: string,
  ids: string[],
  catalog: LeagueBootstrap['players'],
): TradeSideData {
  return {
    label,
    assets: ids.map((id) => tradeAssetFromCatalogPlayer(id, catalog)),
  };
}

export function tradeSideFromPlayers(label: string, players: Player[]): TradeSideData {
  return {
    label,
    assets: players.map(tradeAssetFromPlayer),
  };
}

export function tradeSideFromMockPackagePlayers(
  label: string,
  players: SuggestedPackage['youSend'] | SuggestedPackage['youReceive'],
): TradeSideData {
  return {
    label,
    assets: players.map((player, index) => ({
      id: `${label}-${player.name}-${index}`,
      name: player.name,
      position: player.position,
      subtitle: `${player.team} · ${player.projection.toFixed(1)} pts`,
      headshotUrl: null,
      teamLogoUrl: teamLogoUrl(player.team),
      kind: 'player',
    })),
  };
}

export function primaryTradePosition(mover: Pick<MarketMover, 'getPlayerIds' | 'getPlayerId'>, players: LeagueBootstrap['players']) {
  const ids = mover.getPlayerIds ?? (mover.getPlayerId ? [mover.getPlayerId] : []);
  return ids[0] ? players[ids[0]]?.position ?? null : null;
}
