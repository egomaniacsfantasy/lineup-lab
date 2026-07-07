import { useEffect, useState } from 'react';
import type { Player, Position } from '../../types';
import {
  getManifestHeadshotUrl,
  getManifestInitials,
  getPlayerManifestEntry,
} from '../../data/playerManifest';
import {
  cacheImageFailure,
  getInitials,
  getPlayerAvatarUrl,
  hasCachedImageFailure,
} from '../../utils/playerAssets';
import './PlayerHeadshot.css';

interface PlayerHeadshotProps {
  player?: Player;
  slug?: string;
  name?: string;
  position?: Position | string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

function getPositionTone(position: Position | string | undefined) {
  switch (position) {
    case 'QB':
      return 'qb';
    case 'RB':
      return 'rb';
    case 'WR':
      return 'wr';
    case 'TE':
      return 'te';
    case 'K':
      return 'k';
    case 'DEF':
      return 'def';
    default:
      return 'wr';
  }
}

export function PlayerHeadshot({
  player,
  slug,
  name,
  position,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
}: PlayerHeadshotProps) {
  const resolvedSlug = slug ?? player?.slug ?? player?.id ?? '';
  const manifestEntry = resolvedSlug ? getPlayerManifestEntry(resolvedSlug) : null;
  const displayName = name ?? player?.shortName ?? manifestEntry?.displayName ?? '';
  const resolvedPosition = position ?? player?.position ?? manifestEntry?.position ?? 'WR';
  const headshotUrl =
    resolvedPosition === 'DEF' && player
      ? player.teamLogoUrl
      : player
        ? getPlayerAvatarUrl(player)
        : getManifestHeadshotUrl(resolvedSlug);
  const [hasImageError, setHasImageError] = useState(hasCachedImageFailure(headshotUrl));
  const initials =
    resolvedSlug
      ? getManifestInitials(resolvedSlug, displayName)
      : getInitials(displayName);

  useEffect(() => {
    setHasImageError(hasCachedImageFailure(headshotUrl));
  }, [headshotUrl]);

  return (
    <span
      className={[
        'player-headshot',
        `player-headshot--${getPositionTone(resolvedPosition)}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {hasImageError || !headshotUrl ? (
        <span
          className={['player-headshot__fallback', fallbackClassName]
            .filter(Boolean)
            .join(' ')}
        >
          {initials}
        </span>
      ) : (
        <img
          alt=""
          className={['player-headshot__image', imageClassName]
            .filter(Boolean)
            .join(' ')}
          onError={() => {
            cacheImageFailure(headshotUrl);
            setHasImageError(true);
          }}
          src={headshotUrl}
        />
      )}
    </span>
  );
}
