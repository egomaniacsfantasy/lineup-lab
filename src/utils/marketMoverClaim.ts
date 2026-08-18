import type { ApiCatalogPlayer } from '../services/leagueApi';
import { apiUrl } from '../services/apiBase.ts';
import type { Player, Position } from '../types';
import { playerShortName } from './playerNames.ts';

function toPosition(position: string | null | undefined): Position {
  return (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(position ?? '')
    ? position
    : 'WR') as Position;
}

function claimNameFromHeadline(headline: string, playerId: string) {
  const match = headline.match(/^Claim\s+(.+?)\s+off waivers$/i);
  const parsed = match?.[1]?.trim();
  if (parsed) return parsed;
  return playerId ? 'Waiver claim' : 'Player';
}

function claimPositionFromDetail(detail: string) {
  const match = detail.match(/\bat\s+(QB|RB|WR|TE|K|DEF)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function resolveWaiverClaimPlayer(
  mover: { playerId?: string; headline: string; detail: string },
  catalog: Record<string, ApiCatalogPlayer>,
): Player | undefined {
  if (!mover.playerId) return undefined;
  const entry = catalog[mover.playerId];
  const name = entry?.name ?? claimNameFromHeadline(mover.headline, mover.playerId);
  const team = entry?.team ?? 'FA';
  const position = toPosition(entry?.position ?? claimPositionFromDetail(mover.detail));

  return {
    id: mover.playerId,
    name,
    shortName: playerShortName(name, position),
    position,
    team,
    headshotUrl:
      position === 'DEF'
        ? apiUrl(`/api/img/logo/${mover.playerId.toLowerCase()}`)
        : apiUrl(`/api/img/headshot/${mover.playerId}`),
    teamLogoUrl: apiUrl(`/api/img/logo/${team.toLowerCase()}`),
    bye: 0,
    isActive: entry?.status !== 'Inactive',
    injuryStatus: entry?.injuryStatus ?? undefined,
  };
}
