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

/** "Your title" reads as "Title" inside a block already headed Their side. */
function mirrorLabel(label: string) {
  const stripped = label.replace(/^your\s+/i, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

/** A headshot that 404s used to render as a torn-image icon, because the only
 *  fallback was "no url at all". Failing images now swap to initials. */
function AssetIcon({ asset }: { asset: TradeAssetItem }) {
  const [failed, setFailed] = useState(false);

  if (asset.kind !== 'player') {
    return (
      <span className="trade-display__asset-token" aria-hidden="true">
        {asset.kind === 'pick' ? 'PK' : 'TXT'}
      </span>
    );
  }

  return (
    <span className="trade-display__asset-avatar" aria-hidden="true">
      {asset.headshotUrl && !failed ? (
        <img
          alt=""
          className="trade-display__asset-avatar-image"
          onError={() => setFailed(true)}
          src={asset.headshotUrl}
        />
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
            media={<AssetIcon asset={asset} />}
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
  const [detailOpen, setDetailOpen] = useState(false);

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
        /* Ticket. A deal is a slip you pick up and act on, so the card is
           never wider than its content, your outcome sits at the top where it
           decides whether to keep reading, and the actions live on the surface
           rather than behind a whole-card click nobody can see. */
        <div className="trade-display__ticket">
          {leadRow ? (
            <header
              className={[
                'trade-display__tHead',
                `trade-display__tHead--${verdictTone}`,
              ].join(' ')}
            >
              {verdictLabel ? (
                <span className="trade-display__tWord">{verdictLabel}</span>
              ) : null}
              <span className="trade-display__tLine">
                <span
                  className={[
                    'trade-display__tTitle',
                    leadRow.tone === 'positive'
                      ? 'trade-display__tTitle--positive'
                      : leadRow.tone === 'negative'
                        ? 'trade-display__tTitle--negative'
                        : '',
                  ].filter(Boolean).join(' ')}
                >
                  {leadRow.value}
                </span>
                <span className="trade-display__tTitleLabel">{leadRow.label}</span>
              </span>
            </header>
          ) : null}

          <div className="trade-display__tBody">
            <TradeSide side={sendSide} tone="send" />
            <div className="trade-display__tRule" aria-hidden="true"><span>for</span></div>
            <TradeSide side={getSide} tone="get" />
          </div>

          {supportRows.length > 0 ? (
            <div className="trade-display__tStats">
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
                </span>
              ))}
            </div>
          ) : null}

          {/* Their side of every number, on demand. Keeping it collapsed is
              what lets the default card stay a glance. */}
          {detailOpen ? (
            <div className="trade-display__tDetails" id={`${id}-detail`}>
              <span className="trade-display__tPartner">
                {partnerLine ? `${partnerLine} · their side` : 'Their side'}
              </span>
              {[leadRow, ...supportRows]
                .filter((row) => row?.mirror)
                .map((row) => (
                  <span className="trade-display__stat" key={`m-${row!.label}`}>
                    {/* The block already says whose side this is, so the
                        metric drops its "Your" rather than reading
                        "Your title them". */}
                    <span className="trade-display__stat-label">
                      {mirrorLabel(row!.label)}
                    </span>
                    <span
                      className={[
                        'trade-display__stat-value',
                        row!.mirror!.tone === 'positive'
                          ? 'trade-display__stat-value--positive'
                          : row!.mirror!.tone === 'negative'
                            ? 'trade-display__stat-value--negative'
                            : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {row!.mirror!.value}
                    </span>
                  </span>
                ))}
              {generatedAt ? (
                <span className="trade-display__generated">generated at {generatedAt}</span>
              ) : null}
            </div>
          ) : null}

          <footer className="trade-display__tFoot">
            {acceptanceProbability != null && acceptanceValue ? (
              <>
                <div className="trade-display__tAccept">
                  <span className="trade-display__tAcceptPct">{acceptanceValue}</span>
                  <span className="trade-display__tAcceptBand">
                    {acceptanceBand} to accept
                  </span>
                </div>
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

            <div className="trade-display__tActions">
              {onClick ? (
                <button
                  className="trade-display__tPrimary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClick();
                  }}
                  type="button"
                >
                  Build this trade
                </button>
              ) : null}
              <button
                aria-controls={`${id}-detail`}
                aria-expanded={detailOpen}
                className="trade-display__tDetailToggle"
                onClick={(event) => {
                  event.stopPropagation();
                  setDetailOpen((open) => !open);
                }}
                type="button"
              >
                {detailOpen ? 'Hide their side' : 'Their side'}
              </button>
            </div>
          </footer>
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
