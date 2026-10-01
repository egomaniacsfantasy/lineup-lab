import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { resolveApiUrl } from '../../services/apiBase.ts';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import { SimulationLoader } from '../ui/SimulationLoader';
import { toPlayer } from '../../adapters/connectedLeague';
import {
  fetchTradeFinder,
  type ApiTeam,
  type LeagueBootstrap,
  type LeaguePricing,
  type PricedFuture,
  type TradeSuggestion,
} from '../../services/leagueApi';
import { tradeSignature } from '../../utils/tradeMarket';
import { deltaTone, signedPct } from '../../utils/tradeVerdict';
import { formatProbOrOdds } from '../../utils/formatOdds';
import {
  ANY_PICK,
  DEFAULT_MAX_PARTNER_LOSS,
  DEFAULT_MIN_GAIN,
  EMPTY_QUERY,
  FINDER_POSITIONS,
  FINDER_SHAPES,
  deriveStartingPoints,
  describeQuery,
  finderLayout,
  isExactTrade,
  matchesShapes,
  partnersWords,
  passesLimits,
  pickWords,
  pinnedPlayer,
  positionSublines,
  queryToRequests,
  rankDeals,
  reconcileQuery,
  shapesWords,
  sizesLabel,
  suggestionSizes,
  togglePartner,
  togglePlayer,
  togglePosition,
  toggleShape,
  type FinderQuery,
  type SlotPick,
  type StartingPoint,
} from '../../utils/tradeFinderQuery';
import './TradeFinder.css';

/**
 * The trade finder as a ticket, on the trade sender's logic.
 *
 * Three legs and a shape: who with, what you send, what you get, and the
 * package sizes. Every leg is a pool ("any of these") and takes several picks:
 * several managers, several positions, several players, several shapes. Left
 * open, a leg is no limit.
 *
 * The search is the sender's: each manager is scanned one at a time by the
 * per-manager search at the analyzer's full sim count, a deal is kept only if
 * your title odds rise (by your minimum) and theirs fall by no more than your
 * limit, and deals rank by your title gain. There is no "chance they accept"
 * number anywhere: a deal is shown with what it does to each side's title odds.
 *
 * The results read the ticket back: a leg pinned to one player is the header,
 * said once, and each row is only what varied.
 */

type Slot = 'partner' | 'send' | 'get';

interface Reads {
  [rosterId: number]: { friendliness: number; relationship: number };
}

export interface TradeFinderProps {
  bootstrap: LeagueBootstrap;
  pricing: LeaguePricing | null;
  leagueId: string;
  userId: string;
  userTeam: ApiTeam;
  partners: ApiTeam[];
  futuresByRoster: Map<number, PricedFuture>;
  readsByRoster: Reads;
  /** A deep link's partner (/market?manager=3). Applied when it changes. */
  presetPartnerRosterId: number | null;
  dismissedSignatures: Set<string>;
  onDismiss: (signature: string) => void;
  onRestoreAll: () => void;
  /** Open a found deal in the builder, filled in. */
  onBuild: (suggestion: TradeSuggestion) => void;
  onShare: (suggestion: TradeSuggestion) => void;
  /** Every leg exact: not a search, a trade. The builder prices it. */
  onPriceExact: (trade: { partnerRosterId: number; give: string[]; get: string[] }) => void;
  /** The builder is mid-request; the finder stays put rather than racing it. */
  busy: boolean;
}

interface ResultEntry {
  suggestion: TradeSuggestion;
  signature: string;
}

/* The top of the "they lose at most" slider means no limit. */
const MAX_LOSS_SLIDER_TOP = 10;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TM';
}

function formatScannedAt(value: number | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function recordText(record: { wins: number; losses: number; ties?: number }) {
  return record.ties ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

export function TradeFinder({
  bootstrap,
  pricing,
  leagueId,
  userId,
  userTeam,
  partners,
  futuresByRoster,
  readsByRoster,
  presetPartnerRosterId,
  dismissedSignatures,
  onDismiss,
  onRestoreAll,
  onBuild,
  onShare,
  onPriceExact,
  busy,
}: TradeFinderProps) {
  const [query, setQuery] = useState<FinderQuery>(EMPTY_QUERY);
  /* The query the results belong to. The ticket can be edited while results
     from the last run are still on screen, so the header reads the run, not
     the draft. */
  const [ranQuery, setRanQuery] = useState<FinderQuery | null>(null);
  const [minGain, setMinGain] = useState(DEFAULT_MIN_GAIN);
  const [maxLoss, setMaxLoss] = useState<number | null>(DEFAULT_MAX_PARTNER_LOSS);
  /* Managers are scanned one at a time; this is where the walk has got to. */
  const [progress, setProgress] = useState<{ done: number; total: number; name: string | null; shape: string | null } | null>(null);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [suggestions, setSuggestions] = useState<TradeSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [ticketOpen, setTicketOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const runRef = useRef(0);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const teams = bootstrap.teams;
  const players = bootstrap.players;
  const partnerById = useMemo(() => new Map(partners.map((team) => [team.rosterId, team])), [partners]);
  const meanOf = (id: string) => pricing?.playerMeans?.[id]?.mean ?? null;
  const ownerOf = (id: string) => teams.find((team) => team.players.includes(id)) ?? null;

  useEffect(() => {
    if (presetPartnerRosterId == null || !partnerById.has(presetPartnerRosterId)) return;
    setQuery((current) => reconcileQuery({ ...current, partnerRosterIds: [presetPartnerRosterId] }, teams));
  }, [partnerById, presetPartnerRosterId, teams]);

  const startingPoints = useMemo(
    () => deriveStartingPoints({
      teams,
      players,
      playerMeans: pricing?.playerMeans,
      rosterPositions: bootstrap.league.rosterPositions,
    }),
    [bootstrap.league.rosterPositions, players, pricing?.playerMeans, teams],
  );

  const names = (q: FinderQuery) => ({
    partners: q.partnerRosterIds.map((id) => partnerById.get(id)?.teamName).filter((name): name is string => Boolean(name)),
    sendPlayers: q.send.kind === 'player' ? q.send.ids.map((id) => players[id]?.name ?? id) : [],
    getPlayers: q.get.kind === 'player' ? q.get.ids.map((id) => players[id]?.name ?? id) : [],
  });

  const update = (patch: Partial<FinderQuery>) =>
    setQuery((current) => reconcileQuery({ ...current, ...patch }, teams));

  const exact = isExactTrade(query);

  const run = async (next: FinderQuery = query) => {
    if (busy) return;
    const exactSend = pinnedPlayer(next.send);
    const exactGet = pinnedPlayer(next.get);
    if (isExactTrade(next) && exactSend && exactGet) {
      onPriceExact({ partnerRosterId: next.partnerRosterIds[0], give: [exactSend], get: [exactGet] });
      return;
    }
    const runId = runRef.current + 1;
    runRef.current = runId;
    const requests = queryToRequests(next, teams);
    setLoading(true);
    setError(null);
    setRanQuery(next);
    setShowAll(false);
    setTicketOpen(false);
    setSuggestions([]);
    setProgress({ done: 0, total: requests.length, name: null, shape: null });
    window.setTimeout(() => resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
    let failed = 0;
    /* One manager and one shape at a time. Deals land on the board as each
       search finishes instead of after the whole league. */
    for (const [index, request] of requests.entries()) {
      if (runRef.current !== runId) return;
      setProgress({
        done: index,
        total: requests.length,
        name: partnerById.get(request.partnerRosterId)?.teamName ?? null,
        shape: FINDER_SHAPES.find((entry) => entry.id === request.shape)?.label ?? null,
      });
      try {
        const response = await fetchTradeFinder(leagueId, {
          userId,
          partnerRosterId: request.partnerRosterId,
          rules: request.rules,
          shapes: request.shapes,
          readsByRoster,
        });
        if (runRef.current !== runId) return;
        if (!response.available) {
          setError(response.reason === 'no_projections'
            ? 'Trades price once projections are imported.'
            : 'The book could not scan right now.');
          break;
        }
        const found = response.suggestions ?? [];
        if (found.length) setSuggestions((current) => [...(current ?? []), ...found]);
        if (response.debug) console.info('[trade-finder]', response.debug);
      } catch {
        if (runRef.current !== runId) return;
        failed += 1;
      }
    }
    if (runRef.current !== runId) return;
    if (failed > 0) {
      setError(failed === requests.length
        ? 'The scan did not finish.'
        : `${failed} of ${requests.length} searches did not finish. Run it again to retry them.`);
    }
    setProgress(null);
    setScannedAt(Date.now());
    setLoading(false);
  };

  const applyStartingPoint = (point: StartingPoint) => {
    const next = reconcileQuery({ ...EMPTY_QUERY, ...point.query }, teams);
    setQuery(next);
    void run(next);
  };

  const entries = useMemo<ResultEntry[]>(() => {
    if (!suggestions || !ranQuery) return [];
    return rankDeals(suggestions
      .filter((suggestion) => matchesShapes(suggestion, ranQuery.shapes))
      .map((suggestion) => ({
        suggestion,
        signature: tradeSignature({
          leagueId,
          partnerRosterId: suggestion.partnerRosterId,
          givePlayerIds: suggestion.give.map((asset) => asset.id),
          getPlayerIds: suggestion.get.map((asset) => asset.id),
        }),
      }))
      .filter((entry) => !dismissedSignatures.has(entry.signature)));
  }, [dismissedSignatures, leagueId, ranQuery, suggestions]);

  /* The sender's keep rule, applied to what the scan returned: your title odds
     rise at least `minGain`, theirs fall at most `maxLoss`. */
  const withinLimits = entries.filter((entry) => passesLimits(entry.suggestion, minGain, maxLoss));
  const outsideLimits = entries.length - withinLimits.length;
  const MAX_VISIBLE = 8;
  const visible = showAll ? withinLimits : withinLimits.slice(0, MAX_VISIBLE);
  const hidden = withinLimits.length - visible.length;
  const layout = ranQuery ? finderLayout(ranQuery) : 'open';

  /* ── Ticket legs ── */

  const legValue = (slot: Slot): { text: string; empty: boolean; badge?: ReactNode } => {
    if (slot === 'partner') {
      const picked = query.partnerRosterIds.map((id) => partnerById.get(id)).filter((team): team is ApiTeam => Boolean(team));
      if (picked.length === 0) return { text: 'Anyone', empty: true };
      if (picked.length === 1) return { text: picked[0].teamName, empty: false, badge: <TeamAvatar team={picked[0]} size="sm" /> };
      return { text: `${picked.length} managers`, empty: false, badge: <TeamAvatar team={picked[0]} size="sm" /> };
    }
    const pick = slot === 'send' ? query.send : query.get;
    if (pick.kind === 'position') {
      const one = pick.positions.length === 1 ? pick.positions[0] : null;
      return {
        text: one
          ? (slot === 'send' ? `Your ${one}s` : `Their ${one}s`)
          : pick.positions.join(', '),
        empty: false,
        badge: <span className="trade-finder__pos trade-finder__pos--on">{one ?? pick.positions.length}</span>,
      };
    }
    if (pick.kind === 'player') {
      const first = pick.ids[0];
      const player = players[first];
      return {
        text: pick.ids.length === 1 ? (player?.name ?? first) : `${pick.ids.length} players`,
        empty: false,
        badge: (
          <PlayerHeadshot
            className="trade-finder__leg-headshot"
            fallbackClassName="trade-finder__leg-headshot-fallback"
            imageClassName="trade-finder__leg-headshot-image"
            player={toPlayer(first, players)}
          />
        ),
      };
    }
    return { text: 'Anything', empty: true };
  };

  const renderLeg = (slot: Slot, label: string) => {
    const value = legValue(slot);
    return (
      <button
        aria-haspopup="dialog"
        className="trade-finder__leg"
        disabled={busy}
        onClick={() => setPicker(slot)}
        type="button"
      >
        <span className="trade-finder__leg-label">{label}</span>
        <span className={['trade-finder__leg-value', value.empty ? 'trade-finder__leg-value--empty' : ''].filter(Boolean).join(' ')}>
          {value.badge}
          <span className="trade-finder__leg-text">{value.text}</span>
        </span>
        <svg aria-hidden="true" className="trade-finder__caret" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
    );
  };

  const summaryChips = ranQuery ? [
    { text: partnersWords(ranQuery, names(ranQuery).partners), on: ranQuery.partnerRosterIds.length > 0 },
    { text: `send ${pickWords(ranQuery.send, names(ranQuery).sendPlayers)}`, on: ranQuery.send.kind !== 'any' },
    { text: `get ${pickWords(ranQuery.get, names(ranQuery).getPlayers)}`, on: ranQuery.get.kind !== 'any' },
    { text: shapesWords(ranQuery.shapes), on: ranQuery.shapes.length > 0 },
  ] : [];

  /* ── Results header: the pinned leg, said once ── */

  const renderPinnedPlayer = (id: string, eyebrow: string) => {
    const player = players[id];
    const owner = ownerOf(id);
    const mean = meanOf(id);
    const future = owner ? futuresByRoster.get(owner.rosterId) : null;
    return (
      <div className="trade-finder__pinned">
        <PlayerHeadshot
          className="trade-finder__pinned-headshot"
          fallbackClassName="trade-finder__pinned-headshot-fallback"
          imageClassName="trade-finder__pinned-headshot-image"
          player={toPlayer(id, players)}
        />
        <span className="trade-finder__pinned-copy">
          <span className="trade-finder__eyebrow">{eyebrow}</span>
          <span className="trade-finder__pinned-name">{player?.name ?? id}</span>
          <span className="trade-finder__pinned-meta">
            {player?.position ? <span className="trade-finder__pos">{player.position}</span> : null}
            {[player?.team, owner && !owner.isUser
              ? `owned by ${owner.teamName}, ${recordText(owner.record)}${future?.championOdds != null ? `, title ${formatProbOrOdds(future.titleProb)}` : ''}`
              : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        {mean != null ? (
          <span className="trade-finder__pinned-stat">
            <span className="trade-finder__tag">Proj</span>
            <span className="trade-finder__num">{mean.toFixed(1)}</span>
          </span>
        ) : null}
      </div>
    );
  };

  const renderPositionHead = (q: FinderQuery) => {
    const sub = positionSublines({
      team: userTeam,
      players,
      playerMeans: pricing?.playerMeans,
      rosterPositions: bootstrap.league.rosterPositions,
    });
    const side = (pick: SlotPick, eyebrow: string, tone: 'get' | 'send') => {
      const positions = pick.kind === 'position' ? pick.positions : [];
      const position = positions.length === 1 ? positions[0] : null;
      const glyph = pick.kind === 'position'
        ? positions.join('/')
        : pick.kind === 'player'
          ? `${pick.ids.length}`
          : 'Any';
      return (
        <span className={`trade-finder__pair-side trade-finder__pair-side--${tone}`}>
          <span className="trade-finder__eyebrow">{eyebrow}</span>
          <span className={['trade-finder__pair-glyph', pick.kind === 'any' ? 'trade-finder__pair-glyph--open' : ''].filter(Boolean).join(' ')}>
            {glyph}
          </span>
          <span className="trade-finder__pair-sub">
            {position
              ? tone === 'get'
                ? (sub[position].starter ? `Your ${sub[position].starter} now` : `${sub[position].rostered} rostered`)
                : `${sub[position].rostered} rostered`
              : pick.kind === 'position'
                ? 'Any of these positions'
                : pick.kind === 'player'
                  ? 'Any of the players you picked'
                  : tone === 'get' ? 'Whatever lifts your title' : 'Whatever they will take'}
          </span>
        </span>
      );
    };
    const partner = q.partnerRosterIds.length === 1 ? partnerById.get(q.partnerRosterIds[0]) : null;
    return (
      <div className="trade-finder__pair">
        {side(q.get, 'You get', 'get')}
        <svg aria-hidden="true" className="trade-finder__swap" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M7 16h14m0 0l-3-3m3 3l-3 3M17 8H3m0 0l3-3M3 8l3 3" />
        </svg>
        {side(q.send, 'You send', 'send')}
        {partner ? (
          <span className="trade-finder__pair-partner">
            <TeamAvatar team={partner} size="sm" />
            <span>with {partner.teamName}</span>
          </span>
        ) : q.partnerRosterIds.length > 1 ? (
          <span className="trade-finder__pair-partner">
            <span>with {q.partnerRosterIds.length} managers</span>
          </span>
        ) : null}
      </div>
    );
  };

  const renderHead = () => {
    if (!ranQuery) return null;
    const getId = pinnedPlayer(ranQuery.get);
    const sendId = pinnedPlayer(ranQuery.send);
    if (layout === 'get-player' && getId) return renderPinnedPlayer(getId, 'To get');
    if (layout === 'send-player' && sendId) return renderPinnedPlayer(sendId, 'To move');
    if (layout === 'both-players' && getId && sendId) {
      return (
        <div className="trade-finder__pinned-stack">
          {renderPinnedPlayer(getId, 'To get')}
          {renderPinnedPlayer(sendId, 'For')}
        </div>
      );
    }
    return renderPositionHead(ranQuery);
  };

  const rowsEyebrow = layout === 'get-player'
    ? 'What it costs you'
    : layout === 'send-player'
      ? 'What he brings back'
      : layout === 'both-players'
        ? 'With a throw-in'
        : ranQuery?.get.kind === 'position' && ranQuery.get.positions.length === 1
          ? `Best ${ranQuery.get.positions[0]} you can land`
          : 'Deals the book likes';

  /* ── One deal ── */

  const renderAssets = (assets: TradeSuggestion['give'], omit: string | null, lead: boolean) => {
    const shown = assets.filter((asset) => asset.id !== omit);
    if (shown.length === 0) return null;
    return shown.map((asset, index) => {
      const player = players[asset.id];
      return (
        <span
          className={['trade-finder__who', lead && index === 0 ? 'trade-finder__who--lead' : ''].filter(Boolean).join(' ')}
          key={asset.id}
        >
          <PlayerHeadshot
            className="trade-finder__who-headshot"
            fallbackClassName="trade-finder__who-headshot-fallback"
            imageClassName="trade-finder__who-headshot-image"
            player={toPlayer(asset.id, players)}
          />
          <span className="trade-finder__who-name">{asset.name}</span>
          {player?.position ? <span className="trade-finder__pos">{player.position}</span> : null}
        </span>
      );
    });
  };

  const renderDeal = (entry: ResultEntry, index: number) => {
    const { suggestion } = entry;
    const partner = partnerById.get(suggestion.partnerRosterId);
    const sizes = suggestionSizes(suggestion);
    const pinnedGet = ranQuery ? pinnedPlayer(ranQuery.get) : null;
    const pinnedSend = ranQuery ? pinnedPlayer(ranQuery.send) : null;
    const partnerPinned = ranQuery?.partnerRosterIds.length === 1;
    const getAssets = renderAssets(suggestion.get, pinnedGet, layout !== 'get-player');
    const sendAssets = renderAssets(suggestion.give, pinnedSend, layout === 'get-player');
    const youTone = deltaTone(suggestion.youDelta);
    const themTone = deltaTone(suggestion.partnerDelta);
    return (
      <article
        className={['trade-finder__deal', index === 0 ? 'trade-finder__deal--lead' : ''].filter(Boolean).join(' ')}
        key={entry.signature}
      >
        <button
          aria-label={`Build this trade with ${partner?.teamName ?? suggestion.partnerName}`}
          className="trade-finder__deal-open"
          disabled={busy}
          onClick={() => onBuild(suggestion)}
          type="button"
        >
          <span className="trade-finder__deal-sides">
            {layout === 'get-player' ? (
              <>
                {sendAssets}
                {getAssets ? <span className="trade-finder__for">plus {getAssets}</span> : null}
              </>
            ) : (
              <>
                {getAssets}
                {sendAssets ? <span className="trade-finder__for"><span className="trade-finder__for-word">for</span>{sendAssets}</span> : null}
              </>
            )}
          </span>
          <span className="trade-finder__deal-tags">
            <span className="trade-finder__tag">{sizesLabel(sizes)}</span>
            {!partnerPinned ? <span className="trade-finder__tag trade-finder__tag--partner">{partner?.teamName ?? suggestion.partnerName}</span> : null}
          </span>
          <span className="trade-finder__deal-price">
            <span className="trade-finder__tag">Your title</span>
            <span className={`trade-finder__num trade-finder__num--lead trade-finder__num--${youTone}`}>{signedPct(suggestion.youDelta)}</span>
            <span className="trade-finder__num trade-finder__num--them">
              them <span className={`trade-finder__num--${themTone}`}>{signedPct(suggestion.partnerDelta)}</span>
            </span>
          </span>
        </button>
        <span className="trade-finder__deal-actions">
          <button className="trade-finder__deal-action" onClick={() => onShare(suggestion)} type="button">Share</button>
          <button
            aria-label="Dismiss this deal"
            className="trade-finder__deal-action"
            onClick={() => onDismiss(entry.signature)}
            type="button"
          >
            Dismiss
          </button>
        </span>
      </article>
    );
  };

  /* ── Empty state, with the way out ── */

  const renderEmpty = () => {
    if (!ranQuery) return null;
    const loosen: { label: string; apply: () => void }[] = [];
    if (outsideLimits > 0) {
      loosen.push({
        label: 'Show every deal that helps me',
        apply: () => { setMinGain(0); setMaxLoss(null); },
      });
    }
    if (ranQuery.shapes.length > 0) loosen.push({ label: 'Any shape', apply: () => void run({ ...ranQuery, shapes: [] }) });
    if (ranQuery.partnerRosterIds.length > 0) {
      loosen.push({ label: 'Try anyone', apply: () => void run(reconcileQuery({ ...ranQuery, partnerRosterIds: [] }, teams)) });
    }
    if (ranQuery.send.kind !== 'any') loosen.push({ label: 'Send anything', apply: () => void run({ ...ranQuery, send: ANY_PICK }) });
    if (ranQuery.get.kind !== 'any') loosen.push({ label: 'Get anything', apply: () => void run({ ...ranQuery, get: ANY_PICK }) });
    return (
      <div className="trade-finder__empty">
        <p className="trade-finder__empty-head">
          {outsideLimits > 0
            ? `${outsideLimits} ${outsideLimits === 1 ? 'deal helps' : 'deals help'} you, but outside your limits.`
            : 'The book found nothing for that ask at a price that helps you.'}
        </p>
        <p className="trade-finder__empty-detail">{describeQuery(ranQuery, names(ranQuery))}.</p>
        {loosen.length ? (
          <div className="trade-finder__loosen">
            {loosen.map((option) => (
              <button className="trade-finder__chip" key={option.label} onClick={option.apply} type="button">{option.label}</button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const findLabel = exact ? 'Price this trade' : 'Find trades';

  return (
    <div className={['trade-finder', ticketOpen || !ranQuery ? '' : 'trade-finder--collapsed'].filter(Boolean).join(' ')}>
      <div className="trade-finder__ask">
        {ranQuery && !ticketOpen ? (
          <div className="trade-finder__summary">
            {summaryChips.map((chip) => (
              <span
                className={['trade-finder__chip', 'trade-finder__chip--static', chip.on ? 'trade-finder__chip--on' : 'trade-finder__chip--dim'].join(' ')}
                key={chip.text}
              >
                {chip.text}
              </span>
            ))}
            <button className="trade-finder__chip trade-finder__chip--edit" onClick={() => setTicketOpen(true)} type="button">
              Edit
            </button>
          </div>
        ) : null}

        <section aria-label="Your ask" className="trade-finder__ticket">
          <div className="trade-finder__ticket-head">
            <span className="trade-finder__ticket-title">Your ask</span>
            {ranQuery ? (
              <button
                className="trade-finder__ticket-clear"
                onClick={() => { setQuery(EMPTY_QUERY); }}
                type="button"
              >
                Clear
              </button>
            ) : (
              <span className="trade-finder__ticket-week">Week {bootstrap.week}</span>
            )}
          </div>
          {renderLeg('partner', 'Partner')}
          {renderLeg('send', 'You send')}
          {renderLeg('get', 'You get')}
          <div className="trade-finder__shape-row">
            <span className="trade-finder__leg-label">Shape</span>
            <div aria-label="Package shapes" className="trade-finder__seg trade-finder__seg--wrap" role="group">
              <button
                aria-pressed={query.shapes.length === 0}
                className={['trade-finder__seg-btn', query.shapes.length === 0 ? 'trade-finder__seg-btn--on' : ''].filter(Boolean).join(' ')}
                disabled={busy}
                onClick={() => update({ shapes: [] })}
                type="button"
              >
                Any
              </button>
              {FINDER_SHAPES.map((shape) => {
                const on = query.shapes.includes(shape.id);
                return (
                  <button
                    aria-pressed={on}
                    className={['trade-finder__seg-btn', on ? 'trade-finder__seg-btn--on' : ''].filter(Boolean).join(' ')}
                    disabled={busy}
                    key={shape.id}
                    onClick={() => update({ shapes: toggleShape(query.shapes, shape.id) })}
                    type="button"
                  >
                    {shape.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="trade-finder__shape-note">
            {query.shapes.length === 0
              ? 'Every package size, 1 for 1 up to 3 for 3. Pick one or more to search only those (faster).'
              : `Only ${shapesWords(query.shapes)}. The first number is what you send.`}
          </p>
          <div className="trade-finder__ticket-foot">
            {loading ? (
              <SimulationLoader
                label={progress && progress.total > 1
                  ? `Search ${Math.min(progress.done + 1, progress.total)} of ${progress.total}${progress.name ? `: ${progress.name}` : ''}${progress.shape ? `, ${progress.shape}` : ''}`
                  : `Scanning ${describeQuery(query, names(query)).toLowerCase()}`}
                size="compact"
                variant="scan"
              />
            ) : (
              <button className="trade-finder__find" disabled={busy} onClick={() => void run()} type="button">
                {findLabel}
              </button>
            )}
          </div>
        </section>

      </div>

      {!ranQuery ? (
        /* The results column before a first run. Only a wide screen shows it,
           where an empty right half otherwise reads as something missing. */
        <div aria-hidden="true" className="trade-finder__idle">
          <span className="trade-finder__idle-glyph">?</span>
          <p className="trade-finder__idle-head">Fill in as much or as little as you like.</p>
          <p className="trade-finder__idle-body">
Pick any number of managers, positions, players and shapes, or nothing at all: leave every leg open and the book scans every manager, one at a time. Every deal it returns raises your title odds and is priced exactly as the trade analyzer prices it.
          </p>
        </div>
      ) : null}

      {ranQuery ? (
        <div className="trade-finder__results" ref={resultsRef}>
          {loading && entries.length === 0 ? (
            <SimulationLoader label={`Scanning ${describeQuery(ranQuery, names(ranQuery)).toLowerCase()}`} variant="scan" />
          ) : (
            <section aria-label="Deals" className={['trade-finder__board', loading ? 'trade-finder__board--stale' : ''].filter(Boolean).join(' ')}>
              {renderHead()}

              <div className="trade-finder__floor">
                <label className="trade-finder__floor-label" htmlFor="trade-finder-min-gain">
                  Your title rises at least <span className="trade-finder__num">{minGain.toFixed(1)}</span>
                </label>
                <input
                  className="trade-finder__floor-input"
                  id="trade-finder-min-gain"
                  max={5}
                  min={0}
                  onChange={(event) => { setMinGain(Number(event.target.value)); setShowAll(false); }}
                  step={0.5}
                  type="range"
                  value={minGain}
                />
                <span className="trade-finder__floor-note">
                  {outsideLimits > 0 ? `${outsideLimits} outside your limits` : 'Nothing hidden'}
                </span>
              </div>
              <div className="trade-finder__floor">
                <label className="trade-finder__floor-label" htmlFor="trade-finder-max-loss">
                  Their title falls at most <span className="trade-finder__num">{maxLoss == null ? 'any' : maxLoss.toFixed(1)}</span>
                </label>
                <input
                  className="trade-finder__floor-input"
                  id="trade-finder-max-loss"
                  max={MAX_LOSS_SLIDER_TOP}
                  min={0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setMaxLoss(value >= MAX_LOSS_SLIDER_TOP ? null : value);
                    setShowAll(false);
                  }}
                  step={0.5}
                  type="range"
                  value={maxLoss == null ? MAX_LOSS_SLIDER_TOP : maxLoss}
                />
                <span className="trade-finder__floor-note">
                  {progress ? `${progress.done} of ${progress.total} searches done` : 'Title odds, in points'}
                </span>
              </div>

              <div className="trade-finder__rows-head">
                <span className="trade-finder__eyebrow">{rowsEyebrow}</span>
                <span className="trade-finder__rows-meta">
                  {withinLimits.length} {withinLimits.length === 1 ? 'deal' : 'deals'}
                  {scannedAt ? ` · scanned ${formatScannedAt(scannedAt)}` : ''}
                </span>
              </div>

              {error ? <p className="trade-finder__error" role="status">{error}</p> : null}

              {visible.length > 0 ? (
                <div className="trade-finder__rows">
                  {visible.map(renderDeal)}
                </div>
              ) : !error && !loading ? renderEmpty() : null}

              {hidden > 0 ? (
                <button className="trade-finder__more" onClick={() => setShowAll(true)} type="button">
                  Show {hidden} more
                </button>
              ) : null}

              {dismissedSignatures.size > 0 ? (
                <p className="trade-finder__restore">
                  Dismissed deals ({dismissedSignatures.size}) ·{' '}
                  <button className="trade-finder__restore-btn" onClick={onRestoreAll} type="button">Restore</button>
                </p>
              ) : null}
            </section>
          )}
        </div>
      ) : null}

      {startingPoints.length > 0 ? (
        <div className="trade-finder__starts">
          <span className="trade-finder__eyebrow">{ranQuery ? 'Other places to start' : 'Or start from'}</span>
          {startingPoints.map((point) => (
            <button
              className="trade-finder__start"
              disabled={busy || loading}
              key={point.id}
              onClick={() => applyStartingPoint(point)}
              type="button"
            >
              <span className="trade-finder__start-badge">
                {point.badge.kind === 'position'
                  ? <span className="trade-finder__pos">{point.badge.position}</span>
                  : (() => {
                      const team = partnerById.get(point.badge.kind === 'team' ? point.badge.rosterId : -1);
                      return team ? <TeamAvatar team={team} size="md" /> : null;
                    })()}
              </span>
              <span className="trade-finder__start-copy">
                <span className="trade-finder__start-title">{point.title}</span>
                <span className="trade-finder__start-detail">{point.detail}</span>
              </span>
              <svg aria-hidden="true" className="trade-finder__caret" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          ))}
        </div>
      ) : null}

      {picker ? (
        <FinderPicker
          bootstrap={bootstrap}
          futuresByRoster={futuresByRoster}
          onClose={() => setPicker(null)}
          onPick={(patch) => update(patch)}
          partners={partners}
          pricing={pricing}
          query={query}
          slot={picker}
          userTeam={userTeam}
        />
      ) : null}
    </div>
  );
}

/* ── The picker sheet: one for every leg ─────────────────────────────────── */

function TeamAvatar({ team, size }: { team: ApiTeam; size: 'sm' | 'md' }) {
  return (
    <span aria-hidden="true" className={`trade-finder__avatar trade-finder__avatar--${size}`}>
      {team.avatarUrl ? <img alt="" src={resolveApiUrl(team.avatarUrl) ?? undefined} /> : <span>{initials(team.teamName)}</span>}
    </span>
  );
}

interface FinderPickerProps {
  slot: Slot;
  query: FinderQuery;
  bootstrap: LeagueBootstrap;
  pricing: LeaguePricing | null;
  userTeam: ApiTeam;
  partners: ApiTeam[];
  futuresByRoster: Map<number, PricedFuture>;
  onPick: (patch: Partial<FinderQuery>) => void;
  onClose: () => void;
}

function FinderPicker({ slot, query, bootstrap, pricing, userTeam, partners, futuresByRoster, onPick, onClose }: FinderPickerProps) {
  const players = bootstrap.players;
  const current: SlotPick = slot === 'send' ? query.send : slot === 'get' ? query.get : ANY_PICK;
  const [mode, setMode] = useState<'position' | 'player'>(current.kind === 'player' ? 'player' : 'position');
  const [search, setSearch] = useState('');
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    firstRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = slot === 'partner' ? 'Partner' : slot === 'send' ? 'You send' : 'You get';
  const sublines = positionSublines({
    team: userTeam,
    players,
    playerMeans: pricing?.playerMeans,
    rosterPositions: bootstrap.league.rosterPositions,
  });

  const pool = useMemo(() => {
    const owners = slot === 'send'
      ? [userTeam]
      : query.partnerRosterIds.length > 0
        ? partners.filter((team) => query.partnerRosterIds.includes(team.rosterId))
        : partners;
    const q = search.trim().toLowerCase();
    return owners
      .flatMap((team) => team.players.map((id) => ({ id, team })))
      .filter(({ id }) => ['QB', 'RB', 'WR', 'TE'].includes(players[id]?.position ?? ''))
      .filter(({ id }) => !q || (players[id]?.name ?? '').toLowerCase().includes(q))
      .map((entry) => ({ ...entry, mean: pricing?.playerMeans?.[entry.id]?.mean ?? null }))
      .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))
      .slice(0, 40);
  }, [partners, players, pricing?.playerMeans, query.partnerRosterIds, search, slot, userTeam]);

  /* Portaled to the body: the page's own stacking contexts otherwise trap a
     fixed sheet under the tab bar, which is what a sheet is for escaping. */
  return createPortal(
    <div className="trade-finder__scrim" onClick={onClose} role="presentation">
      <div
        aria-label={title}
        aria-modal="true"
        className="trade-finder__sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span aria-hidden="true" className="trade-finder__grip" />
        <div className="trade-finder__sheet-head">
          <span className="trade-finder__sheet-title">{title}</span>
          <button
            className="trade-finder__sheet-any"
            onClick={() => { onPick(slot === 'partner' ? { partnerRosterIds: [] } : slot === 'send' ? { send: ANY_PICK } : { get: ANY_PICK }); onClose(); }}
            ref={firstRef}
            type="button"
          >
            {slot === 'partner' ? 'Anyone' : 'Anything'}
          </button>
        </div>

        {slot === 'partner' ? (
          <div className="trade-finder__list">
            {partners.map((team) => {
              const future = futuresByRoster.get(team.rosterId);
              const on = query.partnerRosterIds.includes(team.rosterId);
              return (
                <button
                  aria-pressed={on}
                  className={['trade-finder__item', on ? 'trade-finder__item--on' : ''].filter(Boolean).join(' ')}
                  key={team.rosterId}
                  onClick={() => onPick({ partnerRosterIds: togglePartner(query.partnerRosterIds, team.rosterId) })}
                  type="button"
                >
                  <TeamAvatar size="md" team={team} />
                  <span className="trade-finder__item-copy">
                    <span className="trade-finder__item-name">{team.teamName}</span>
                    <span className="trade-finder__item-meta">{recordText(team.record)}</span>
                  </span>
                  <span className="trade-finder__item-stat">
                    <span className="trade-finder__tag">Title</span>
                    <span className="trade-finder__price">
                      {future?.championOdds != null ? formatProbOrOdds(future.titleProb) : 'Off board'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div aria-label="Pick by" className="trade-finder__seg" role="radiogroup">
              {(['position', 'player'] as const).map((option) => (
                <button
                  aria-checked={mode === option}
                  className={['trade-finder__seg-btn', mode === option ? 'trade-finder__seg-btn--on' : ''].filter(Boolean).join(' ')}
                  key={option}
                  onClick={() => setMode(option)}
                  role="radio"
                  type="button"
                >
                  {option === 'position' ? 'Positions' : 'Players'}
                </button>
              ))}
            </div>

            {mode === 'position' ? (
              <>
                <div className="trade-finder__tiles">
                  {FINDER_POSITIONS.map((position) => {
                    const on = current.kind === 'position' && current.positions.includes(position);
                    const sub = sublines[position];
                    return (
                      <button
                        aria-pressed={on}
                        className={['trade-finder__tile', on ? 'trade-finder__tile--on' : ''].filter(Boolean).join(' ')}
                        key={position}
                        onClick={() => onPick(slot === 'send' ? { send: togglePosition(current, position) } : { get: togglePosition(current, position) })}
                        type="button"
                      >
                        <span className="trade-finder__tile-glyph">{position}</span>
                        <span className="trade-finder__tile-sub">
                          {slot === 'get' ? (sub.starter ?? `${sub.rostered} rostered`) : `${sub.rostered} rostered`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="trade-finder__sheet-note">
                  {slot === 'get'
                    ? 'Pick one or more. Every player you get comes from the positions you pick. Under each is what your starter projects now.'
                    : 'Pick one or more. Every player you send comes from the positions you pick. Under each is how many you carry.'}
                </p>
              </>
            ) : (
              <>
                <label className="trade-finder__search">
                  <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="16" height="16">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={slot === 'send' ? 'Search your roster' : query.partnerRosterIds.length > 0 ? 'Search their rosters' : 'Search the league'}
                    type="search"
                    value={search}
                  />
                </label>
                <div className="trade-finder__list">
                  {pool.map(({ id, team, mean }) => {
                    const player = players[id];
                    const on = current.kind === 'player' && current.ids.includes(id);
                    return (
                      <button
                        aria-pressed={on}
                        className={['trade-finder__item', on ? 'trade-finder__item--on' : ''].filter(Boolean).join(' ')}
                        key={id}
                        onClick={() => onPick(slot === 'send' ? { send: togglePlayer(current, id) } : { get: togglePlayer(current, id) })}
                        type="button"
                      >
                        <PlayerHeadshot
                          className="trade-finder__item-headshot"
                          fallbackClassName="trade-finder__item-headshot-fallback"
                          imageClassName="trade-finder__item-headshot-image"
                          player={toPlayer(id, players)}
                        />
                        <span className="trade-finder__item-copy">
                          <span className="trade-finder__item-name">{player?.name ?? id}</span>
                          <span className="trade-finder__item-meta">
                            {[player?.position, player?.team, slot === 'get' && query.partnerRosterIds.length !== 1 ? team.teamName : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {mean != null ? <span className="trade-finder__num trade-finder__item-mean">{mean.toFixed(1)}</span> : null}
                      </button>
                    );
                  })}
                  {pool.length === 0 ? <p className="trade-finder__sheet-note">Nobody by that name.</p> : null}
                </div>
              </>
            )}
          </>
        )}
        <div className="trade-finder__sheet-foot">
          <span className="trade-finder__sheet-note">
            {slot === 'partner'
              ? (query.partnerRosterIds.length === 0 ? 'Nobody picked: every manager is scanned.' : `${query.partnerRosterIds.length} picked. Tap again to remove.`)
              : current.kind === 'position'
                ? `${current.positions.length} picked. Tap again to remove.`
                : current.kind === 'player'
                  ? `${current.ids.length} picked. Tap again to remove.`
                  : 'Nothing picked: anything goes.'}
          </span>
          <button className="trade-finder__sheet-done" onClick={onClose} type="button">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
