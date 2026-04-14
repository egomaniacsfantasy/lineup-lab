import type { Player } from '../types';

const AVATAR_OVERRIDES: Record<string, string> = {
  'adams-01': 'https://a.espncdn.com/i/headshots/nfl/players/full/16800.png',
  'kirk-01': 'https://a.espncdn.com/i/headshots/nfl/players/full/3915416.png',
};

const failedImages = new Set<string>();

export function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');
}

export function getPlayerAvatarUrl(player: Player) {
  if (player.position === 'DEF') {
    return player.teamLogoUrl;
  }

  return AVATAR_OVERRIDES[player.id] ?? (player.headshotUrl || player.teamLogoUrl);
}

export function hasCachedImageFailure(src: string) {
  return src.length === 0 || failedImages.has(src);
}

export function cacheImageFailure(src: string) {
  if (src) {
    failedImages.add(src);
  }
}
