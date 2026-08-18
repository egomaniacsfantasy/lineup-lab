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

export function TeamAvatar({ name, avatarUrl, className = '' }: TeamAvatarProps) {
  return (
    <span className={['team-avatar', className].filter(Boolean).join(' ')} aria-hidden="true">
      {avatarUrl ? (
        <img
          alt=""
          className="team-avatar__image"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
          src={resolveApiUrl(avatarUrl) ?? undefined}
        />
      ) : (
        <span className="team-avatar__fallback">{initialsFor(name) || 'OG'}</span>
      )}
    </span>
  );
}
