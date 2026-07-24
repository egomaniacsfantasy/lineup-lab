import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { PlayerLine } from '../ui/DesignPrimitives';

export interface TradeAssetItem {
  id: string;
  name: string;
  position?: string | null;
  subtitle?: string | null;
  headshotUrl?: string | null;
  teamLogoUrl?: string | null;
  kind?: 'player' | 'pick' | 'text';
}

export interface TradeSideData {
  label: string;
  assets: TradeAssetItem[];
}

interface TradeSideProps {
  side: TradeSideData;
  tone: 'send' | 'get' | 'neutral';
  dense?: boolean;
}

interface TradeAcceptanceChipProps {
  probability?: number | null;
  label?: string | null;
}

interface TradeLayoutProps {
  sendSide: TradeSideData;
  getSide: TradeSideData;
  tone?: 'compact' | 'rich';
  partnerLine?: string | null;
  impactLine?: string | null;
  impactRows?: Array<{
    label: string;
    value: string;
    tone?: 'positive' | 'negative' | 'neutral';
    emphasis?: 'primary' | 'secondary';
  }>;
  valueLabel?: string | null;
  acceptanceProbability?: number | null;
  acceptanceLabel?: string | null;
  footer?: ReactNode;
  generatedAt?: string | null;
  dismissLabel?: string | null;
  onDismiss?: ((event: MouseEvent<HTMLButtonElement>) => void) | null;
  onClick?: (() => void) | null;
  whyOpen?: boolean;
  whyTrigger?: ReactNode;
}

type TradeRowProps = Omit<TradeLayoutProps, 'tone' | 'partnerLine' | 'impactLine'>;

type TradeCardProps = Omit<TradeLayoutProps, 'tone'>;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function renderAssetIcon(asset: TradeAssetItem) {
  if (asset.kind !== 'player') {
    return (
      <span className="trade-display__asset-token" aria-hidden="true">
        {asset.kind === 'pick' ? 'PK' : 'TXT'}
      </span>
    );
  }

  return (
    <span className="trade-display__asset-avatar" aria-hidden="true">
      {asset.headshotUrl ? (
        <img alt="" className="trade-display__asset-avatar-image" src={asset.headshotUrl} />
      ) : (
        <span className="trade-display__asset-avatar-fallback">{initials(asset.name)}</span>
      )}
      {asset.teamLogoUrl ? (
        <img alt="" className="trade-display__asset-team" src={asset.teamLogoUrl} />
      ) : null}
    </span>
  );
}

export function TradeSide({ side, tone, dense = false }: TradeSideProps) {
  const [expanded, setExpanded] = useState(false);
  const overflow = side.assets.length - 4;
  const visibleAssets = useMemo(
    () => (expanded || overflow <= 0 ? side.assets : side.assets.slice(0, 4)),
    [expanded, overflow, side.assets],
  );

  return (
    <div className={['trade-display__side', `trade-display__side--${tone}`, dense ? 'trade-display__side--dense' : ''].filter(Boolean).join(' ')}>
      <span className="trade-display__eyebrow">{side.label}</span>
      <div className="trade-display__asset-list">
        {visibleAssets.map((asset) => (
          <PlayerLine
            badge={asset.position ? <span className="trade-display__asset-pill">{asset.position}</span> : null}
            className={[
              'trade-display__asset',
              asset.kind === 'player' ? '' : 'trade-display__asset--textual',
            ].filter(Boolean).join(' ')}
            compact={dense}
            key={asset.id}
            media={renderAssetIcon(asset)}
            name={asset.name}
            subtitle={asset.subtitle}
          />
        ))}
        {overflow > 0 && !expanded ? (
          <button
            className="trade-display__more"
            onClick={() => setExpanded(true)}
            type="button"
          >
            +{overflow} more
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function TradeAcceptanceChip({
  probability,
  label,
}: TradeAcceptanceChipProps) {
  if (probability == null && !label) return null;
  const pct = Math.max(0, Math.min(100, probability ?? 0));
  return (
    <div className="trade-display__acceptance">
      <span className="trade-display__acceptance-track" aria-hidden="true">
        <span className="trade-display__acceptance-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="trade-display__acceptance-label">{label ?? `${pct}%`}</span>
    </div>
  );
}

function TradeLayout({
  sendSide,
  getSide,
  tone = 'compact',
  partnerLine = null,
  impactLine = null,
  impactRows = [],
  valueLabel = null,
  acceptanceProbability = null,
  acceptanceLabel = null,
  footer = null,
  generatedAt = null,
  dismissLabel = 'Dismiss',
  onDismiss = null,
  onClick = null,
  whyOpen = false,
  whyTrigger = null,
}: TradeLayoutProps) {
  const id = useId();
  const interactiveProps = onClick
    ? {
        onClick,
        onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onClick();
        },
        role: 'button' as const,
        tabIndex: 0,
      }
    : {};

  return (
    <article
      className={[
        'trade-display',
        tone === 'rich' ? 'trade-display--card' : 'trade-display--row',
        onClick ? 'trade-display--interactive' : '',
      ].filter(Boolean).join(' ')}
      {...interactiveProps}
    >
      {onDismiss ? (
        <button
          aria-label={dismissLabel ?? undefined}
          className="trade-display__dismiss"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      ) : null}

      <div className="trade-display__body">
        <div className="trade-display__swap">
          <TradeSide dense={tone === 'compact'} side={sendSide} tone="send" />
          <span className="trade-display__direction" aria-hidden="true">→</span>
          <TradeSide dense={tone === 'compact'} side={getSide} tone="get" />
        </div>

        <div className="trade-display__rail">
          {partnerLine ? <span className="trade-display__partner">{partnerLine}</span> : null}
          {impactRows.length > 0
            ? impactRows.map((row) => (
              <span
                className={[
                  'trade-display__impact-row',
                  row.emphasis === 'primary'
                    ? 'trade-display__impact-row--primary'
                    : 'trade-display__impact-row--secondary',
                  row.tone === 'positive'
                    ? 'trade-display__impact-row--positive'
                    : row.tone === 'negative'
                      ? 'trade-display__impact-row--negative'
                      : '',
                ].filter(Boolean).join(' ')}
                key={`${row.label}-${row.value}`}
              >
                <span className="trade-display__impact-label">{row.label}</span>
                <span className="trade-display__impact-value">{row.value}</span>
              </span>
              ))
            : impactLine
              ? <span className="trade-display__impact">{impactLine}</span>
              : null}
          {valueLabel && impactRows.length === 0 ? <span className="trade-display__value">{valueLabel}</span> : null}
          <TradeAcceptanceChip label={acceptanceLabel} probability={acceptanceProbability} />
          {generatedAt ? <span className="trade-display__generated">generated at {generatedAt}</span> : null}
        </div>
      </div>

      {(whyTrigger || footer) ? (
        <div className="trade-display__footer">
          <div className="trade-display__footer-meta">
            {whyTrigger ? (
              <span aria-controls={`${id}-why`} className="trade-display__why-trigger">
                {whyTrigger}
              </span>
            ) : null}
          </div>
          {footer ? (
            <div
              className={[
                'trade-display__details',
                whyOpen ? 'trade-display__details--open' : '',
              ].filter(Boolean).join(' ')}
              id={`${id}-why`}
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function TradeRow(props: TradeRowProps) {
  return <TradeLayout {...props} tone="compact" />;
}

export function TradeCard(props: TradeCardProps) {
  return <TradeLayout {...props} tone="rich" />;
}
