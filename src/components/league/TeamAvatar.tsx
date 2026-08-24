import './TeamAvatar.css';
import { resolveApiUrl } from '../../services/apiBase.ts';

interface TeamAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * A stable hue per team.
 *
 * Most teams in most leagues never set an avatar, so the fallback is not an
 * edge case — it is what a board is mostly made of. Rendering them all as the
 * same grey disc turns twelve distinct teams into twelve identical tokens, and
 * a crest that identifies nothing is worse than no crest, because it occupies
 * the space where identity should be.
 *
 * The hash is over the name, so a team keeps its colour for as long as it
 * keeps its name: across sessions, across devices, and between the pick list
 * and the board beside it. Anything random, or anything keyed on list order,
 * would give the same team two colours on one screen.
 */
function hueFor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360;
  }
  return hash;
}

export function TeamAvatar({ name, avatarUrl, className = '' }: TeamAvatarProps) {
  const hue = hueFor(name || 'Odds Gods');

  return (
    <span
      className={['team-avatar', avatarUrl ? '' : 'team-avatar--monogram', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      style={avatarUrl ? undefined : ({ '--team-hue': String(hue) } as React.CSSProperties)}
    >
      {avatarUrl ? (
        <img
          alt=""
          className="team-avatar__image"
          onError={(event) => {
            /* A broken avatar falls back to the monogram rather than to a hole:
               hiding the image alone left an empty disc with no identity in it. */
            const wrapper = event.currentTarget.parentElement;
            if (wrapper) {
              wrapper.classList.add('team-avatar--monogram');
              wrapper.style.setProperty('--team-hue', String(hue));
              wrapper.textContent = initialsFor(name) || 'OG';
            }
          }}
          src={resolveApiUrl(avatarUrl) ?? undefined}
        />
      ) : (
        <span className="team-avatar__fallback">{initialsFor(name) || 'OG'}</span>
      )}
    </span>
  );
}
