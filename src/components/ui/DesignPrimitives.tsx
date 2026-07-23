import type { ReactNode } from 'react';
import './DesignPrimitives.css';

export function Card({
  children,
  className = '',
  tone = 'default',
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'quiet' | 'hero' | 'strip';
  compact?: boolean;
}) {
  return (
    <section
      className={[
        'ui-card',
        `ui-card--${tone}`,
        compact ? 'ui-card--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </section>
  );
}

export function Chip({
  children,
  className = '',
  tone = 'default',
  size = 'md',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'accent' | 'positive' | 'negative' | 'ghost';
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={[
        'ui-chip',
        `ui-chip--${tone}`,
        `ui-chip--${size}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

export function StatBlock({
  label,
  value,
  meta = null,
  className = '',
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  className?: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <div
      className={[
        'ui-stat-block',
        `ui-stat-block--${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="ui-stat-block__label">{label}</span>
      <span className="ui-stat-block__value">{value}</span>
      {meta ? <span className="ui-stat-block__meta">{meta}</span> : null}
    </div>
  );
}

export function PlayerLine({
  media,
  name,
  subtitle = null,
  badge = null,
  trailing = null,
  className = '',
  compact = false,
}: {
  media?: ReactNode;
  name: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        'ui-player-line',
        compact ? 'ui-player-line--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {media ? <span className="ui-player-line__media">{media}</span> : null}
      <span className="ui-player-line__copy">
        <span className="ui-player-line__name">{name}</span>
        {subtitle ? <span className="ui-player-line__subtitle">{subtitle}</span> : null}
      </span>
      {badge ? <span className="ui-player-line__badge">{badge}</span> : null}
      {trailing ? <span className="ui-player-line__trailing">{trailing}</span> : null}
    </div>
  );
}
