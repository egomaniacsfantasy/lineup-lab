import type { Player } from '../types';
import { getManifestHeadshotUrl } from '../data/playerManifest';

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

  return getManifestHeadshotUrl(player.slug ?? player.id) || player.headshotUrl || player.teamLogoUrl;
}

export function hasCachedImageFailure(src: string) {
  return src.length === 0 || failedImages.has(src);
}

export function cacheImageFailure(src: string) {
  if (src) {
    failedImages.add(src);
  }
}
