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
  /* One row per metric. `mirror` is the partner's value for that same metric:
     it rides on its own metric's row rather than taking a row of its own, so
     the rail reads as three decisions instead of six numbers. `lead` is the
     one number the card is actually about. */
  impactRows?: Array<{
    label: string;
    value: string;
    tone?: 'positive' | 'negative' | 'neutral';
    emphasis?: 'lead' | 'primary' | 'secondary';
    mirror?: {
      label: string;
      value: string;
      tone?: 'positive' | 'negative' | 'neutral';
    } | null;
  }>;
  valueLabel?: string | null;
  /* The engine's own read on the lead metric, e.g. "Good value". Rich cards
     lead with the word and let the number back it up: a reader should know
     whether a deal is worth their attention before parsing a percentage. */
  verdictLabel?: string | null;
  verdictTone?: 'good' | 'neutral' | 'bad';
  acceptanceProbability?: number | null;
  acceptanceLabel?: string | null;
  /* Split acceptance for rich cards: the percent leads and the band word sits
     under it. Passed in rather than derived here so this stays a pure display
     component with no vocabulary of its own. */
  acceptanceValue?: string | null;
  acceptanceBand?: string | null;
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
  verdictLabel = null,
  verdictTone = 'neutral',
  acceptanceProbability = null,
  acceptanceLabel = null,
  acceptanceValue = null,
  acceptanceBand = null,
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

  /* Rich cards split the served rows into the one that decides the trade and
     the ones that support it. Engine order is preserved inside each group;
     nothing is hidden, reordered or recomputed. */
  const leadRow = impactRows.find((row) => row.emphasis === 'lead') ?? impactRows[0] ?? null;
  const supportRows = impactRows.filter((row) => row !== leadRow);

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

      {tone === 'rich' ? (
        <div className="trade-display__body">
          {/* The verdict is the card's whole point, so it anchors the left
              edge at full size instead of being squeezed into a gutter. The
              exchange takes the middle, and every supporting number lives on
              one strip underneath rather than being strewn down a rail. */}
          {leadRow ? (
            <div
              className={[
                'trade-display__verdict',
                `trade-display__verdict--${verdictTone}`,
                leadRow.tone === 'positive'
                  ? 'trade-display__verdict--positive'
                  : leadRow.tone === 'negative'
                    ? 'trade-display__verdict--negative'
                    : '',
              ].filter(Boolean).join(' ')}
            >
              {verdictLabel ? (
                <span className="trade-display__verdict-word">{verdictLabel}</span>
              ) : null}
              <span className="trade-display__verdict-value">{leadRow.value}</span>
              <span className="trade-display__verdict-label">{leadRow.label}</span>
              {leadRow.mirror ? (
                <span className="trade-display__verdict-mirror">
                  {leadRow.mirror.label} {leadRow.mirror.value}
                </span>
              ) : null}

              {/* The supporting metrics belong with the lead, not on a
                  full-width strip that was 90% empty. Everything about your
                  outcome now reads as one column. */}
              {supportRows.length > 0 ? (
                <div className="trade-display__verdict-stats">
                  {supportRows.map((row) => (
                    <span
                      className={[
                        'trade-display__stat',
                        row.tone === 'positive'
                          ? 'trade-display__stat--positive'
                          : row.tone === 'negative'
                            ? 'trade-display__stat--negative'
                            : '',
                      ].filter(Boolean).join(' ')}
                      key={`${row.label}-${row.value}`}
                    >
                      <span className="trade-display__stat-label">{row.label}</span>
                      <span className="trade-display__stat-value">{row.value}</span>
                      {row.mirror ? (
                        <span className="trade-display__stat-mirror">
                          {row.mirror.label} {row.mirror.value}
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="trade-display__exchange">
            {partnerLine ? (
              <span className="trade-display__partner">{partnerLine}</span>
            ) : null}
            <div className="trade-display__swap">
              <TradeSide side={sendSide} tone="send" />
              <span className="trade-display__direction" aria-hidden="true">→</span>
              <TradeSide side={getSide} tone="get" />
            </div>
          </div>

          {/* Their side of the question gets its own column, weighted to
              balance the verdict: number first, band word under it. Both the
              percent and the word come from the shared acceptance map. */}
          <div className="trade-display__odds">
            {acceptanceProbability != null && acceptanceValue ? (
              <>
                <span className="trade-display__odds-eyebrow">They accept</span>
                <span className="trade-display__odds-value">{acceptanceValue}</span>
                <span className="trade-display__odds-band">{acceptanceBand}</span>
                <span className="trade-display__acceptance-track" aria-hidden="true">
                  <span
                    className="trade-display__acceptance-fill"
                    style={{ width: `${Math.max(0, Math.min(100, acceptanceProbability))}%` }}
                  />
                </span>
              </>
            ) : (
              <TradeAcceptanceChip label={acceptanceLabel} probability={acceptanceProbability} />
            )}
          </div>

          {generatedAt ? (
            <span className="trade-display__generated">generated at {generatedAt}</span>
          ) : null}
        </div>
      ) : (
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
                  row.emphasis === 'lead'
                    ? 'trade-display__impact-row--lead'
                    : row.emphasis === 'primary'
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
                {row.mirror ? (
                  <span
                    className={[
                      'trade-display__impact-mirror',
                      row.mirror.tone === 'positive'
                        ? 'trade-display__impact-mirror--positive'
                        : row.mirror.tone === 'negative'
                          ? 'trade-display__impact-mirror--negative'
                          : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="trade-display__impact-mirror-label">{row.mirror.label}</span>
                    <span className="trade-display__impact-mirror-value">{row.mirror.value}</span>
                  </span>
                ) : null}
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
      )}

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
