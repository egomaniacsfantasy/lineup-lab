import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { resolveApiUrl } from '../../services/apiBase.ts';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import { toPlayer } from '../../adapters/connectedLeague';
import {
  fetchBoard,
  fetchTradeBoard,
  fetchTradeFinder,
  requestTradeBoardScan,
  type ApiTeam,
  type LeagueBootstrap,
  type LeaguePricing,
  type PricedFuture,
  type TradeBoardScan,
  type TradeSuggestion,
} from '../../services/leagueApi';
import { tradeSignature } from '../../utils/tradeMarket';
import { acceptanceProbability } from '../../utils/tradeAcceptance';
import { deltaTone, signedPct } from '../../utils/tradeVerdict';
import { formatProbOrOdds } from '../../utils/formatOdds';
import {
  ANY_PICK,
  DEFAULT_LIMITS,
  EMPTY_QUERY,
  FINDER_POSITIONS,
  FINDER_SHAPES,
  NOISE_PP,
  acceptanceWord,
  boardMatches,
  buildOutlooks,
  deriveStartingPoints,
  describeQuery,
  groupDeals,
  isExactTrade,
  isLopsided,
  limitsChanged,
  orderAssets,
  outlookValues,
  partnerValueDelta,
  partnersToScan,
  partnersWords,
  passesLimits,
  pickWords,
  pinnedPlayer,
  positionSublines,
  queryToRules,
  queryToShapes,
  reconcileQuery,
  sendConsequence,
  servedByBoard,
  shapesWords,
  sizesLabel,
  standingOf,
  suggestionSizes,
  togglePartner,
  togglePlayer,
  togglePosition,
  toggleShape,
  withinNoise,
  type FinderLimits,
  type FinderPosition,
  type FinderQuery,
  type PlayerOutlook,
  type PlayerValues,
  type SlotPick,
  type StartingPoint,
  type ValueBasis,
} from '../../utils/tradeFinderQuery';
import './TradeFinder.css';

/**
 * The trade finder: a ticket on the left, the board on the right.
 *
 * The ticket is three legs and a shape: who with, what you send, what you
 * get, the package sizes. Each leg takes one pick with one tap, or several
 * through its "+". The board answers the ticket:
 *
 *  - Nothing pinned, or only managers, positions and shapes: the BOARD, a
 *    background scan of every manager that already ran, filtered to the ask.
 *    It is there before the finger lifts, stamped with when it was scanned.
 *  - A named player on either leg: a live WALK of the managers who can
 *    deliver him, one request each, two at a time. The walk is the screen
 *    while it runs; deals land together when it finishes.
 *
 * Deals are lanes, one per player you would land, the best package first
 * and the other ways to get him folded under it. A lane opens in place.
 * Swings under a point of title odds are shown as ties, below a line.
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
  acceptance: number | null;
  /** Roster value the other side gains per game; negative = gives up. */
  valueDelta: number;
  lopsided: boolean;
}

interface Group {
  headlineId: string;
  best: ResultEntry;
  others: ResultEntry[];
}

interface WalkState {
  running: boolean;
  done: number;
  total: number;
  current: number[];
  found: number;
  suggestions: TradeSuggestion[] | null;
  failed: string[];
}

const WALK_CONCURRENCY = 2;
const BOARD_POLL_MS = 4000;
const BOARD_POLL_LIMIT = 45;
const MAX_VISIBLE = 8;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TM';
}

function clockOf(value: number | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function recordText(record: { wins: number; losses: number; ties?: number }) {
  return record.ties ? `${record.wins}-${record.losses}-${record.ties}` : `${record.wins}-${record.losses}`;
}

function surname(name: string) {
  return name.split(' ').slice(-1)[0];
}

function TeamAvatar({ team, size }: { team: ApiTeam; size: 'sm' | 'md' | 'lg' }) {
  return (
    <span aria-hidden="true" className={`trade-finder__avatar trade-finder__avatar--${size}`}>
      {team.avatarUrl ? <img alt="" height={64} loading="lazy" src={resolveApiUrl(team.avatarUrl) ?? undefined} width={64} /> : <span>{initials(team.teamName)}</span>}
    </span>
  );
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
  /* The ask the board is answering. Null until the first Find; the board then
     shows the open ask, every deal, which is what nothing pinned means. */
  const [ranQuery, setRanQuery] = useState<FinderQuery | null>(null);
  const [limits, setLimits] = useState<FinderLimits>(DEFAULT_LIMITS);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [picker, setPicker] = useState<{ slot: Slot; multi: boolean } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  /* The background scan. */
  const [board, setBoard] = useState<{ suggestions: TradeSuggestion[]; lastScan: TradeBoardScan | null; scanning: boolean } | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const pollRef = useRef(0);

  /* The live walk, for a named player. */
  const [walk, setWalk] = useState<WalkState>({ running: false, done: 0, total: 0, current: [], found: 0, suggestions: null, failed: [] });
  const walkRef = useRef(0);

  const teams = bootstrap.teams;
  const players = bootstrap.players;
  const partnerById = useMemo(() => new Map(partners.map((team) => [team.rosterId, team])), [partners]);

  /* ── What a player is worth from here ── */
  const [outlooks, setOutlooks] = useState<Map<string, PlayerOutlook> | null>(null);
  const scoringFamily = bootstrap.league.scoringFamily;
  const leagueWeek = pricing?.week ?? bootstrap.week;
  useEffect(() => {
    let cancelled = false;
    fetchBoard(800, scoringFamily)
      .then((payload) => {
        if (cancelled || !payload.available || payload.rankings.length === 0) return;
        setOutlooks(buildOutlooks(payload.rankings, leagueWeek));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [leagueWeek, scoringFamily]);
  const basis: ValueBasis = outlooks ? 'ros' : 'week';
  const values = useMemo<PlayerValues | null>(
    () => (outlooks ? outlookValues(outlooks) : pricing?.playerMeans ?? null),
    [outlooks, pricing?.playerMeans],
  );
  const valueOf = (id: string) => values?.[id]?.mean ?? null;
  const valueLabel = basis === 'ros' ? 'A game, rest of season' : 'This week';

  /* ── The board: load on arrival, poll while its scan runs ── */
  const loadBoard = useCallback(async () => {
    const pollId = pollRef.current + 1;
    pollRef.current = pollId;
    let polls = 0;
    while (pollRef.current === pollId && polls < BOARD_POLL_LIMIT) {
      polls += 1;
      try {
        const next = await fetchTradeBoard(leagueId, userId);
        if (pollRef.current !== pollId) return;
        setBoard({ suggestions: next.suggestions ?? [], lastScan: next.lastScan ?? null, scanning: next.scanning });
        setBoardError(null);
        if (!next.scanning) return;
      } catch (cause) {
        if (pollRef.current !== pollId) return;
        setBoardError(cause instanceof Error && cause.message ? cause.message : 'The board could not be reached.');
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, BOARD_POLL_MS));
    }
  }, [leagueId, userId]);

  useEffect(() => {
    void loadBoard();
    return () => {
      pollRef.current += 1;
    };
  }, [loadBoard]);

  const rescanBoard = async () => {
    try {
      await requestTradeBoardScan(leagueId, userId);
      setBoard((current) => (current ? { ...current, scanning: true } : current));
      void loadBoard();
    } catch (cause) {
      setBoardError(cause instanceof Error && cause.message ? cause.message : 'The scan could not start.');
    }
  };

  useEffect(() => {
    if (presetPartnerRosterId == null || !partnerById.has(presetPartnerRosterId)) return;
    setQuery((current) => reconcileQuery({ ...current, partnerRosterIds: [presetPartnerRosterId] }, teams));
  }, [partnerById, presetPartnerRosterId, teams]);

  const startingPoints = useMemo(
    () => deriveStartingPoints({
      teams,
      players,
      playerMeans: values,
      rosterPositions: bootstrap.league.rosterPositions,
      basis,
    }),
    [basis, bootstrap.league.rosterPositions, players, teams, values],
  );

  const names = (q: FinderQuery) => ({
    partners: q.partnerRosterIds.map((id) => partnerById.get(id)?.teamName).filter((name): name is string => Boolean(name)),
    sendPlayers: q.send.kind === 'player' ? q.send.ids.map((id) => players[id]?.name ?? id) : [],
    getPlayers: q.get.kind === 'player' ? q.get.ids.map((id) => players[id]?.name ?? id) : [],
  });

  const update = (patch: Partial<FinderQuery>) =>
    setQuery((current) => reconcileQuery({ ...current, ...patch }, teams));

  /* ── Running an ask ── */

  const stopWalk = () => {
    walkRef.current += 1;
    setWalk((current) => ({ ...current, running: false, current: [], suggestions: current.suggestions ?? [] }));
  };

  const runWalk = async (next: FinderQuery) => {
    const walkId = walkRef.current + 1;
    walkRef.current = walkId;
    const rules = queryToRules(next);
    const shapes = queryToShapes(next);
    const ids = partnersToScan(next, teams);
    const found: TradeSuggestion[] = [];
    const failed: string[] = [];
    let done = 0;
    const inFlight = new Set<number>();
    setWalk({ running: true, done: 0, total: ids.length, current: [], found: 0, suggestions: null, failed: [] });
    const scanOne = async (partnerRosterId: number) => {
      inFlight.add(partnerRosterId);
      setWalk((current) => ({ ...current, current: [...inFlight] }));
      let answered = false;
      for (let attempt = 0; attempt < 2 && !answered; attempt += 1) {
        if (walkRef.current !== walkId) return;
        try {
          const answer = await fetchTradeFinder(leagueId, { userId, partnerRosterId, rules, shapes, readsByRoster });
          if (walkRef.current !== walkId) return;
          if (answer.available) {
            found.push(...(answer.suggestions ?? []));
            answered = true;
          }
        } catch {
          if (walkRef.current !== walkId) return;
        }
      }
      if (!answered) failed.push(partnerById.get(partnerRosterId)?.teamName ?? `manager ${partnerRosterId}`);
      inFlight.delete(partnerRosterId);
      done += 1;
      /* Progress only. Deals land together at the end, so the board never
         moves under the person reading it. */
      setWalk((current) => ({ ...current, done, current: [...inFlight], found: found.length, suggestions: found.slice() }));
    };
    const queue = [...ids];
    const workers = Array.from({ length: Math.min(WALK_CONCURRENCY, queue.length) }, async () => {
      while (queue.length && walkRef.current === walkId) {
        const id = queue.shift();
        if (id != null) await scanOne(id);
      }
    });
    await Promise.all(workers);
    if (walkRef.current !== walkId) return;
    setWalk({ running: false, done, total: ids.length, current: [], found: found.length, suggestions: found, failed });
  };

  const run = async (next: FinderQuery = query) => {
    if (busy) return;
    const exactSend = pinnedPlayer(next.send);
    const exactGet = pinnedPlayer(next.get);
    if (isExactTrade(next) && exactSend && exactGet) {
      onPriceExact({ partnerRosterId: next.partnerRosterIds[0], give: [exactSend], get: [exactGet] });
      return;
    }
    setRanQuery(next);
    setLimits(DEFAULT_LIMITS);
    setOpened(null);
    setShowAll(false);
    setTicketOpen(false);
    if (servedByBoard(next)) {
      walkRef.current += 1;
      setWalk((current) => ({ ...current, running: false, current: [], suggestions: null }));
      if (!board) void loadBoard();
    } else {
      await runWalk(next);
    }
  };

  const applyStartingPoint = (point: StartingPoint) => {
    const next = reconcileQuery({ ...EMPTY_QUERY, ...point.query }, teams);
    setQuery(next);
    void run(next);
  };

  /* ── What the board shows ── */

  const asked = ranQuery ?? EMPTY_QUERY;
  const fromBoard = servedByBoard(asked);
  const walking = !fromBoard && walk.running;
  const sourceSuggestions = useMemo(() => {
    if (fromBoard) return (board?.suggestions ?? []).filter((suggestion) => boardMatches(suggestion, asked, players));
    /* While the walk runs the board stays empty: deals land together. */
    return walk.running ? [] : walk.suggestions ?? [];
  }, [asked, board?.suggestions, fromBoard, players, walk.running, walk.suggestions]);

  const entries = useMemo<ResultEntry[]>(() => sourceSuggestions
    .filter((suggestion) => suggestion.youDelta > 0)
    .map((suggestion) => {
      const read = readsByRoster[suggestion.partnerRosterId];
      const valueDelta = partnerValueDelta(suggestion, values);
      return {
        suggestion,
        signature: tradeSignature({
          leagueId,
          partnerRosterId: suggestion.partnerRosterId,
          givePlayerIds: suggestion.give.map((asset) => asset.id),
          getPlayerIds: suggestion.get.map((asset) => asset.id),
        }),
        acceptance: read ? acceptanceProbability(suggestion.partnerDelta, read.friendliness, read.relationship) : null,
        valueDelta,
        lopsided: values != null && isLopsided(valueDelta),
      };
    })
    .filter((entry) => !dismissedSignatures.has(entry.signature)), [dismissedSignatures, leagueId, readsByRoster, sourceSuggestions, values]);

  const kept = useMemo(() => entries.filter((entry) =>
    passesLimits(entry.suggestion, limits.minGain, limits.maxLoss) && !(limits.hideLopsided && entry.lopsided)), [entries, limits]);
  const outside = entries.length - kept.length;
  const groups = useMemo<Group[]>(() => groupDeals(kept, values), [kept, values]);
  const strong = groups.filter((group) => !withinNoise(group.best.suggestion.youDelta));
  const ties = groups.filter((group) => withinNoise(group.best.suggestion.youDelta));
  const visibleStrong = showAll ? strong : strong.slice(0, MAX_VISIBLE);
  const visibleTies = showAll ? ties : ties.slice(0, Math.max(0, MAX_VISIBLE - visibleStrong.length));
  const hidden = (strong.length - visibleStrong.length) + (ties.length - visibleTies.length);

  const scanningBoard = fromBoard
    && !boardError
    && (board == null || (board.scanning && !board.lastScan?.at));

  /* ── Ticket legs ── */

  const legChips = (slot: Slot): { key: string; label: string; badge?: ReactNode; remove: () => void }[] => {
    if (slot === 'partner') {
      return query.partnerRosterIds
        .map((id) => partnerById.get(id))
        .filter((team): team is ApiTeam => Boolean(team))
        .map((team) => ({
          key: `p-${team.rosterId}`,
          label: team.teamName,
          badge: <TeamAvatar size="sm" team={team} />,
          remove: () => update({ partnerRosterIds: togglePartner(query.partnerRosterIds, team.rosterId) }),
        }));
    }
    const pick = slot === 'send' ? query.send : query.get;
    const set = (next: SlotPick) => update(slot === 'send' ? { send: next } : { get: next });
    if (pick.kind === 'position') {
      return pick.positions.map((position) => ({
        key: `pos-${position}`,
        label: slot === 'send' ? `Your ${position}s` : `Their ${position}s`,
        badge: <span className="trade-finder__pos trade-finder__pos--on">{position}</span>,
        remove: () => set(togglePosition(pick, position)),
      }));
    }
    if (pick.kind === 'player') {
      return pick.ids.map((id) => ({
        key: `pl-${id}`,
        label: players[id]?.name ?? id,
        badge: (
          <PlayerHeadshot
            className="trade-finder__leg-headshot"
            fallbackClassName="trade-finder__leg-headshot-fallback"
            imageClassName="trade-finder__leg-headshot-image"
            player={toPlayer(id, players)}
          />
        ),
        remove: () => set(togglePlayer(pick, id)),
      }));
    }
    return [];
  };

  const renderLeg = (slot: Slot, label: string) => {
    const chips = legChips(slot);
    const empty = chips.length === 0;
    return (
      <div className={['trade-finder__leg', empty ? 'trade-finder__leg--empty' : ''].filter(Boolean).join(' ')}>
        <span className="trade-finder__leg-label">{label}</span>
        <span className="trade-finder__leg-value">
          {empty ? (
            <button
              aria-haspopup="dialog"
              className="trade-finder__leg-open"
              disabled={busy}
              onClick={() => setPicker({ slot, multi: false })}
              type="button"
            >
              <span className="trade-finder__leg-text trade-finder__leg-text--empty">{slot === 'partner' ? 'Anyone' : 'Anything'}</span>
              <svg aria-hidden="true" className="trade-finder__caret" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          ) : (
            <>
              {chips.map((chip) => (
                <span className="trade-finder__chip trade-finder__chip--on trade-finder__chip--leg" key={chip.key}>
                  {chip.badge}
                  <span className="trade-finder__chip-text">{chip.label}</span>
                  <button
                    aria-label={`Remove ${chip.label}`}
                    className="trade-finder__chip-x"
                    disabled={busy}
                    onClick={chip.remove}
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                aria-label={`Add another to ${label.toLowerCase()}`}
                className="trade-finder__leg-add"
                disabled={busy}
                onClick={() => setPicker({ slot, multi: true })}
                type="button"
              >
                +
              </button>
            </>
          )}
        </span>
      </div>
    );
  };

  const summaryChips = ranQuery ? [
    { text: partnersWords(ranQuery, names(ranQuery).partners), on: ranQuery.partnerRosterIds.length > 0 },
    { text: `send ${pickWords(ranQuery.send, names(ranQuery).sendPlayers)}`, on: ranQuery.send.kind !== 'any' },
    { text: `get ${pickWords(ranQuery.get, names(ranQuery).getPlayers)}`, on: ranQuery.get.kind !== 'any' },
    { text: shapesWords(ranQuery.shapes), on: ranQuery.shapes.length > 0 },
  ] : [];

  /* ── Faces ── */

  const face = (id: string, size: 'xl' | 'lg' | 'md' | 'sm') => (
    <PlayerHeadshot
      className={`trade-finder__face trade-finder__face--${size}`}
      fallbackClassName="trade-finder__face-fallback"
      imageClassName="trade-finder__face-image"
      key={id}
      player={toPlayer(id, players)}
    />
  );

  const rankOf = (id: string) => {
    const outlook = outlooks?.get(id);
    return outlook ? `${outlook.position}${outlook.positionRank}` : null;
  };

  const playerMeta = (id: string) => {
    const player = players[id];
    const value = valueOf(id);
    return [
      player?.team,
      rankOf(id),
      value != null ? `${value.toFixed(1)} ${basis === 'ros' ? 'a game' : 'this week'}` : null,
      player?.byeWeek != null && player.byeWeek >= leagueWeek ? `bye ${player.byeWeek}` : null,
    ].filter(Boolean).join(' · ');
  };

  /* ── One lane ── */

  /* Every player in a package gets the same row: face, name, line. No
     headline, nobody tucked under anybody. Ordered by value only so two
     readings of the same deal match. */
  const renderSide = (assets: TradeSuggestion['give'], tone: 'get' | 'send') => {
    const ordered = orderAssets(assets, values);
    if (ordered.length === 0) return null;
    return (
      <span className={`trade-finder__side trade-finder__side--${tone}`}>
        {ordered.map((asset) => {
          const player = players[asset.id];
          return (
            <span className="trade-finder__player" key={asset.id}>
              {face(asset.id, 'md')}
              <span className="trade-finder__who">
                <span className="trade-finder__who-name">{player?.name ?? asset.name}</span>
                <span className="trade-finder__who-meta">
                  {player?.position ? <span className="trade-finder__pos">{player.position}</span> : null}
                  {playerMeta(asset.id)}
                </span>
              </span>
            </span>
          );
        })}
      </span>
    );
  };

  const standingLine = (entry: ResultEntry) => {
    const partner = partnerById.get(entry.suggestion.partnerRosterId);
    const future = futuresByRoster.get(entry.suggestion.partnerRosterId);
    const standing = standingOf(future?.playoffProb ?? null);
    const name = partner?.teamName ?? entry.suggestion.partnerName;
    const record = partner ? recordText(partner.record) : null;
    const gives = entry.valueDelta < 0 ? `gives up ${Math.abs(entry.valueDelta).toFixed(1)}` : `gains ${entry.valueDelta.toFixed(1)}`;
    if (standing === 'out') {
      return `${name} is ${record ?? 'out'} and out of the race, so his title odds cannot move. On roster value he ${gives} a game.${entry.lopsided ? ' Expect a no.' : ''}`;
    }
    if (standing === 'bubble') {
      return `${name} is ${record ?? 'on the bubble'} and fighting for a playoff spot. On roster value he ${gives} a game.`;
    }
    return `${name} is ${record ?? 'contending'} and contending, so his title odds are the real price. On roster value he ${gives} a game.`;
  };

  const renderOpen = (group: Group) => {
    const { suggestion } = group.best;
    const getOrdered = orderAssets(suggestion.get, values);
    const sendOrdered = orderAssets(suggestion.give, values);
    const partner = partnerById.get(suggestion.partnerRosterId);
    const future = futuresByRoster.get(suggestion.partnerRosterId);
    const sub = positionSublines({ team: userTeam, players, playerMeans: values, rosterPositions: bootstrap.league.rosterPositions });
    const word = acceptanceWord(group.best.lopsided, group.best.acceptance);

    /* One block per player, the same block on both sides: face, name, line,
       and the stat that matters for that side. */
    const playerBlock = (asset: { id: string; name: string }, tone: 'get' | 'send') => {
      const player = players[asset.id];
      const position = player?.position;
      const mySlot = tone === 'get' && position && (FINDER_POSITIONS as string[]).includes(position)
        ? sub[position as FinderPosition].starter
        : null;
      const consequence = tone === 'send' ? sendConsequence(asset.id, userTeam, players, values, bootstrap.league.rosterPositions) : null;
      const value = valueOf(asset.id);
      return (
        <div className="trade-finder__open-player" key={asset.id}>
          {face(asset.id, 'lg')}
          <span className="trade-finder__open-copy">
            <span className="trade-finder__open-name">{player?.name ?? asset.name}</span>
            <span className="trade-finder__who-meta">
              {position ? <span className="trade-finder__pos">{position}</span> : null}
              {playerMeta(asset.id)}
            </span>
            <span className="trade-finder__open-stats">
              {value != null ? (
                <span className="trade-finder__stat"><span className="trade-finder__tag">{valueLabel}</span><span className="trade-finder__num">{value.toFixed(1)}</span></span>
              ) : null}
              {mySlot ? (
                <span className="trade-finder__stat"><span className="trade-finder__tag">Your {mySlot.split(' ')[0]} now</span><span className="trade-finder__num trade-finder__num--dim">{mySlot.split(' ')[1]}</span></span>
              ) : null}
              {consequence?.slot ? (
                <span className="trade-finder__stat">
                  <span className="trade-finder__tag">{consequence.slot === 'bench' ? 'His slot' : 'Who starts instead'}</span>
                  <span className="trade-finder__stat-text">
                    {consequence.slot === 'bench'
                      ? 'Bench. Nothing leaves your lineup.'
                      : consequence.replacement
                        ? `${consequence.replacement.name}, ${consequence.replacement.perGame.toFixed(1)}`
                        : `Your ${consequence.slot}, with nobody behind him`}
                  </span>
                </span>
              ) : null}
            </span>
          </span>
        </div>
      );
    };

    return (
      <div className="trade-finder__open" id={`deal-${group.best.signature}`}>
        <div className="trade-finder__open-pair">
          <div className="trade-finder__open-side">
            <span className="trade-finder__eyebrow">You get · from {partner?.teamName ?? suggestion.partnerName}{partner ? `, ${recordText(partner.record)}` : ''}</span>
            {getOrdered.map((asset) => playerBlock(asset, 'get'))}
          </div>
          <div className="trade-finder__open-side trade-finder__open-side--send">
            <span className="trade-finder__eyebrow">You send</span>
            {sendOrdered.map((asset) => playerBlock(asset, 'send'))}
          </div>
        </div>

        <div className="trade-finder__open-numbers">
          <div className="trade-finder__open-number">
            <span className="trade-finder__tag">Your title</span>
            <span className={`trade-finder__num trade-finder__num--big trade-finder__num--${deltaTone(suggestion.youDelta)}`}>{signedPct(suggestion.youDelta)}</span>
            <span className="trade-finder__who-meta">
              {suggestion.youPlayoffDelta != null ? <>Playoffs <span className={`trade-finder__num--${deltaTone(suggestion.youPlayoffDelta)}`}>{signedPct(suggestion.youPlayoffDelta)}</span></> : null}
              {suggestion.youWeekDelta != null ? <> · this week <span className={`trade-finder__num--${deltaTone(suggestion.youWeekDelta)}`}>{signedPct(suggestion.youWeekDelta)}</span></> : null}
            </span>
          </div>
          <div className="trade-finder__open-number">
            <span className="trade-finder__tag">His side</span>
            <span className={`trade-finder__num trade-finder__num--big trade-finder__num--${deltaTone(suggestion.partnerDelta)}`}>{signedPct(suggestion.partnerDelta)}</span>
            <span className="trade-finder__who-meta">{values ? standingLine(group.best) : `${partner?.teamName ?? suggestion.partnerName}${future ? `, title ${formatProbOrOdds(future.titleProb)}` : ''}`}</span>
          </div>
          <div className="trade-finder__open-number">
            <span className="trade-finder__tag">Will he take it</span>
            <span className={`trade-finder__word trade-finder__word--${word.tone}`}>{word.word}</span>
            <span className="trade-finder__who-meta">
              {group.best.lopsided
                ? 'Lopsided on value. The analyzer can find the throw-in that evens it.'
                : group.best.acceptance != null
                  ? 'From your read on him and what the deal does to his side.'
                  : 'No read on this manager yet.'}
            </span>
          </div>
        </div>

        <div className="trade-finder__open-foot">
          <div className="trade-finder__alts">
            <span className="trade-finder__tag">{group.others.length ? `${group.others.length} other ${group.others.length === 1 ? 'package' : 'packages'} for the same player` : 'The only package the book found for him'}</span>
            {group.others.map((other) => {
              const otherWord = acceptanceWord(other.lopsided, other.acceptance);
              const give = orderAssets(other.suggestion.give, values);
              const get = orderAssets(other.suggestion.get, values);
              return (
                <button className="trade-finder__alt" key={other.signature} onClick={() => onBuild(other.suggestion)} type="button">
                  <span className="trade-finder__alt-who">
                    <span className="trade-finder__faces trade-finder__faces--tight">{get.map((asset) => face(asset.id, 'sm'))}</span>
                    <span>{get.map((asset) => surname(players[asset.id]?.name ?? asset.name)).join(' + ')}</span>
                    <span className="trade-finder__tag">for</span>
                    <span className="trade-finder__faces trade-finder__faces--tight">{give.map((asset) => face(asset.id, 'sm'))}</span>
                    <span>{give.map((asset) => surname(players[asset.id]?.name ?? asset.name)).join(' + ')}</span>
                    <span className="trade-finder__tag">{sizesLabel(suggestionSizes(other.suggestion))}</span>
                  </span>
                  <span className={`trade-finder__num trade-finder__num--${deltaTone(other.suggestion.youDelta)}`}>{signedPct(other.suggestion.youDelta)}</span>
                  <span className={`trade-finder__who-meta trade-finder__word--${otherWord.tone}`}>{otherWord.word}</span>
                </button>
              );
            })}
          </div>
          <div className="trade-finder__open-actions">
            <button className="trade-finder__act" onClick={() => onDismiss(group.best.signature)} type="button">Dismiss</button>
            <button className="trade-finder__act" onClick={() => onShare(suggestion)} type="button">Share</button>
            <button className="trade-finder__act trade-finder__act--primary" disabled={busy} onClick={() => onBuild(suggestion)} type="button">Build this trade</button>
          </div>
        </div>
      </div>
    );
  };

  const renderLane = (group: Group, index: number, tie: boolean) => {
    const { suggestion } = group.best;
    const partner = partnerById.get(suggestion.partnerRosterId);
    const isOpen = opened === group.best.signature;
    return (
      <article
        className={[
          'trade-finder__lane',
          index === 0 && !tie ? 'trade-finder__lane--lead' : '',
          isOpen ? 'trade-finder__lane--open' : '',
          tie ? 'trade-finder__lane--tie' : '',
        ].filter(Boolean).join(' ')}
        key={group.best.signature}
      >
        <button
          aria-controls={`deal-${group.best.signature}`}
          aria-expanded={isOpen}
          className="trade-finder__lane-main"
          onClick={() => setOpened(isOpen ? null : group.best.signature)}
          type="button"
        >
          {renderSide(suggestion.get, 'get')}
          <span className="trade-finder__swap-col">
            <svg aria-hidden="true" className="trade-finder__swap" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M7 16h14m0 0l-3-3m3 3l-3 3M17 8H3m0 0l3-3M3 8l3 3" />
            </svg>
            <span className="trade-finder__tag">{sizesLabel(suggestionSizes(suggestion))}</span>
          </span>
          {renderSide(suggestion.give, 'send')}
          <span className="trade-finder__lane-price">
            <span className={`trade-finder__num trade-finder__num--lead trade-finder__num--${tie ? 'dim' : deltaTone(suggestion.youDelta)}`}>{signedPct(suggestion.youDelta)}</span>
            <span className="trade-finder__who-meta">
              {partner ? `${partner.teamName}, ${recordText(partner.record)}` : suggestion.partnerName} · them{' '}
              <span className={`trade-finder__num--${deltaTone(suggestion.partnerDelta)}`}>{signedPct(suggestion.partnerDelta)}</span>
              {group.others.length ? ` · ${group.others.length + 1} ways` : ''}
            </span>
          </span>
          <span aria-hidden="true" className="trade-finder__chev">{isOpen ? '▾' : '›'}</span>
        </button>
        {isOpen ? renderOpen(group) : null}
      </article>
    );
  };

  /* ── The scan, as a screen ── */

  const renderScan = (kind: 'board' | 'walk') => {
    const ids = kind === 'walk' ? partnersToScan(asked, teams) : partners.map((team) => team.rosterId);
    const current = kind === 'walk' ? new Set(walk.current) : new Set<number>();
    const doneSet = new Set<number>();
    if (kind === 'walk') {
      let counted = 0;
      for (const id of ids) {
        if (current.has(id)) continue;
        if (counted < walk.done) { doneSet.add(id); counted += 1; }
      }
    }
    const currentNames = [...current].map((id) => partnerById.get(id)?.teamName).filter((name): name is string => Boolean(name));
    const pct = ids.length ? Math.round((walk.done / ids.length) * 100) : 0;
    return (
      <section aria-live="polite" className="trade-finder__scan">
        <span className="trade-finder__eyebrow">
          {kind === 'walk'
            ? `Searching ${ids.length === 1 ? 'one manager' : `${ids.length} managers`}: ${describeQuery(asked, names(asked)).toLowerCase()}`
            : 'The book is scanning every manager for the first time'}
        </span>
        <div className={['trade-finder__scan-grid', kind === 'board' ? 'trade-finder__scan-grid--pulse' : ''].filter(Boolean).join(' ')}>
          {ids.map((id) => {
            const team = partnerById.get(id);
            if (!team) return null;
            const state = doneSet.has(id) ? 'done' : current.has(id) ? 'now' : 'todo';
            return (
              <span className={`trade-finder__scan-team trade-finder__scan-team--${state}`} key={id}>
                <TeamAvatar size="lg" team={team} />
                <span className="trade-finder__scan-name">{team.teamName}</span>
              </span>
            );
          })}
        </div>
        <div className="trade-finder__scan-status">
          <span className="trade-finder__scan-current">{kind === 'walk' ? (currentNames.join(' and ') || 'Starting') : 'About a minute'}</span>
          <span className="trade-finder__who-meta">
            {kind === 'walk'
              ? <>Manager <span className="trade-finder__num">{Math.min(walk.done + walk.current.length, ids.length)} of {ids.length}</span> · <span className="trade-finder__num">{walk.found}</span> {walk.found === 1 ? 'deal' : 'deals'} found so far</>
              : 'Every manager, every shape, at the analyzer\'s full sim count. After this it stays warm in the background.'}
          </span>
        </div>
        <span className="trade-finder__scan-bar"><span style={{ width: `${kind === 'walk' ? pct : 0}%` }} /></span>
        {kind === 'walk' ? (
          <>
            <p className="trade-finder__scan-note">Deals land together when the walk finishes, so the board never moves under you.</p>
            <button className="trade-finder__act" onClick={stopWalk} type="button">Stop and show what's found</button>
          </>
        ) : null}
      </section>
    );
  };

  /* ── Empty state ── */

  const renderEmpty = () => {
    const loosen: { label: string; apply: () => void }[] = [];
    if (outside > 0) loosen.push({ label: 'Show every deal that helps me', apply: () => setLimits({ minGain: 0, maxLoss: null, hideLopsided: false }) });
    if (asked.shapes.length > 0) loosen.push({ label: 'Any shape', apply: () => void run({ ...asked, shapes: [] }) });
    if (asked.partnerRosterIds.length > 0) loosen.push({ label: 'Try anyone', apply: () => void run(reconcileQuery({ ...asked, partnerRosterIds: [] }, teams)) });
    if (asked.send.kind !== 'any') loosen.push({ label: 'Send anything', apply: () => void run({ ...asked, send: ANY_PICK }) });
    if (asked.get.kind !== 'any') loosen.push({ label: 'Get anything', apply: () => void run({ ...asked, get: ANY_PICK }) });
    return (
      <div className="trade-finder__empty">
        <p className="trade-finder__empty-head">
          {outside > 0
            ? `${outside} ${outside === 1 ? 'deal helps' : 'deals help'} you, but outside your limits.`
            : fromBoard && !ranQuery
              ? 'The last scan found no deal that lifts your title odds.'
              : 'The book found nothing for that ask at a price that helps you.'}
        </p>
        {ranQuery ? <p className="trade-finder__empty-detail">{describeQuery(ranQuery, names(ranQuery))}.</p> : null}
        {!fromBoard && walk.failed.length ? <p className="trade-finder__empty-detail">{walk.failed.length} {walk.failed.length === 1 ? 'manager' : 'managers'} did not answer: {walk.failed.join(', ')}.</p> : null}
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

  /* ── Board header ── */

  const scannedLine = () => {
    if (!fromBoard) {
      const walked = partnersToScan(asked, teams).length;
      const failed = walk.failed.length ? ` ${walk.failed.length} did not answer.` : '';
      return `Searched ${walked === 1 ? 'one manager' : `${walked} managers`} just now, at the analyzer's full sim count.${failed}`;
    }
    const at = clockOf(board?.lastScan?.at);
    if (!at) return 'Every manager, every shape.';
    const reason = board?.lastScan?.reason === 'projections_updated' ? ', after a projections update' : '';
    return `Every manager, every shape. Scanned ${at}${reason}.${board?.scanning ? ' A fresh scan is running.' : ''}`;
  };

  const getPin = pinnedPlayer(asked.get);
  const sendPin = pinnedPlayer(asked.send);
  const boardTitle = !ranQuery || (asked.partnerRosterIds.length === 0 && asked.send.kind === 'any' && asked.get.kind === 'any')
    ? 'The board'
    : asked.get.kind === 'position' && asked.get.positions.length === 1
      ? `Best ${asked.get.positions[0]} you can land`
      : getPin
        ? `To get ${players[getPin]?.name ?? 'him'}`
        : sendPin
          ? `What ${players[sendPin]?.name ?? 'he'} brings back`
          : 'Deals the book likes';

  const findLabel = isExactTrade(query) ? 'Price this trade' : servedByBoard(query) ? 'Show the board' : 'Find trades';
  const limitCount = (limits.minGain !== DEFAULT_LIMITS.minGain ? 1 : 0)
    + (limits.maxLoss !== DEFAULT_LIMITS.maxLoss ? 1 : 0)
    + (limits.hideLopsided !== DEFAULT_LIMITS.hideLopsided ? 1 : 0);
  const lanesShown = visibleStrong.length + visibleTies.length;

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
              <button className="trade-finder__ticket-clear" onClick={() => { setQuery(EMPTY_QUERY); }} type="button">Clear</button>
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
              ? 'Every package size, 1 for 1 up to 3 for 3.'
              : `Only ${shapesWords(query.shapes)}. The first number is what you send.`}
          </p>
          <div className="trade-finder__ticket-foot">
            {walking ? (
              <button className="trade-finder__find trade-finder__find--quiet" onClick={stopWalk} type="button">Stop the search</button>
            ) : (
              <button className="trade-finder__find" disabled={busy} onClick={() => void run()} type="button">{findLabel}</button>
            )}
            <p className="trade-finder__ticket-note">
              {servedByBoard(query)
                ? 'Nothing on either leg reads the book\'s last scan of every manager, so there is nothing to wait for.'
                : 'A position or a player is searched live, two managers at a time, so the book builds its packages around it.'}
            </p>
          </div>
        </section>
      </div>

      <div className="trade-finder__results">
        {walking ? renderScan('walk') : scanningBoard ? renderScan('board') : (
          <section aria-label="Deals" className="trade-finder__board">
            <div className="trade-finder__board-head">
              <span className="trade-finder__board-title-wrap">
                <span className="trade-finder__board-title">{boardTitle}</span>
                <span className="trade-finder__who-meta">{scannedLine()}{boardError ? ` ${boardError}` : ''}</span>
              </span>
              <span className="trade-finder__board-tools">
                <button
                  aria-expanded={limitsOpen}
                  className={['trade-finder__ghost', limitsChanged(limits) ? 'trade-finder__ghost--on' : ''].filter(Boolean).join(' ')}
                  onClick={() => setLimitsOpen(true)}
                  type="button"
                >
                  Limits{limitCount ? <span className="trade-finder__num"> {limitCount}</span> : null}
                </button>
                {fromBoard ? (
                  <button className="trade-finder__ghost" disabled={Boolean(board?.scanning)} onClick={() => void rescanBoard()} type="button">
                    {board?.scanning ? 'Scanning' : 'Scan again'}
                  </button>
                ) : (
                  <button className="trade-finder__ghost" disabled={busy} onClick={() => void run(asked)} type="button">Search again</button>
                )}
              </span>
            </div>

            {lanesShown > 0 ? (
              <div className="trade-finder__lanes">
                <div aria-hidden="true" className="trade-finder__lanes-head">
                  <span className="trade-finder__tag">You get</span><span /><span className="trade-finder__tag">You send</span><span className="trade-finder__tag trade-finder__tag--right">Your title</span><span />
                </div>
                {visibleStrong.map((group, index) => renderLane(group, index, false))}
                {visibleTies.length ? (
                  <div className="trade-finder__divider">Under {NOISE_PP} point. The book calls these ties</div>
                ) : null}
                {visibleTies.map((group, index) => renderLane(group, index, true))}
              </div>
            ) : renderEmpty()}

            {hidden > 0 ? (
              <button className="trade-finder__more" onClick={() => setShowAll(true)} type="button">Show {hidden} more</button>
            ) : null}
            {outside > 0 && lanesShown > 0 ? (
              <p className="trade-finder__restore">{outside} outside your limits.</p>
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

      {startingPoints.length > 0 ? (
        <div className="trade-finder__starts">
          <span className="trade-finder__eyebrow">{ranQuery ? 'Other places to start' : 'Or start from'}</span>
          {startingPoints.map((point) => (
            <button
              className="trade-finder__start"
              disabled={busy || walking}
              key={point.id}
              onClick={() => applyStartingPoint(point)}
              type="button"
            >
              <span className="trade-finder__start-badge">
                {point.badge.kind === 'position'
                  ? <span className="trade-finder__pos">{point.badge.position}</span>
                  : (() => {
                      const team = partnerById.get(point.badge.kind === 'team' ? point.badge.rosterId : -1);
                      return team ? <TeamAvatar size="md" team={team} /> : null;
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
          basis={basis}
          bootstrap={bootstrap}
          futuresByRoster={futuresByRoster}
          multi={picker.multi}
          onClose={() => setPicker(null)}
          onPick={(patch) => update(patch)}
          outlooks={outlooks}
          partners={partners}
          query={query}
          slot={picker.slot}
          userTeam={userTeam}
          values={values}
          week={leagueWeek}
        />
      ) : null}

      {limitsOpen ? (
        <LimitsSheet
          kept={groups.length}
          limits={limits}
          onChange={setLimits}
          onClose={() => setLimitsOpen(false)}
        />
      ) : null}
    </div>
  );
}

/* ── Limits, behind a button ─────────────────────────────────────────────── */

const MAX_LOSS_TOP = 10;

function LimitsSheet({ limits, kept, onChange, onClose }: { limits: FinderLimits; kept: number; onChange: (next: FinderLimits) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="trade-finder__scrim" onClick={onClose} role="presentation">
      <div aria-label="Limits" aria-modal="true" className="trade-finder__sheet trade-finder__sheet--limits" onClick={(event) => event.stopPropagation()} role="dialog">
        <span aria-hidden="true" className="trade-finder__grip" />
        <div className="trade-finder__sheet-head">
          <span className="trade-finder__sheet-title">Limits</span>
          <button className="trade-finder__sheet-any" onClick={() => onChange(DEFAULT_LIMITS)} type="button">Reset</button>
        </div>
        <p className="trade-finder__sheet-note">
          Out of the box the board shows every deal that lifts both sides. These tighten it. They reset when you change the ask, so a slider from one search never quietly filters the next.
        </p>
        <div className="trade-finder__limit">
          <label className="trade-finder__limit-label" htmlFor="trade-finder-min-gain">
            <span>Your title rises at least</span>
            <span className="trade-finder__num">{limits.minGain.toFixed(1)} pp</span>
          </label>
          <input
            className="trade-finder__floor-input"
            id="trade-finder-min-gain"
            max={5}
            min={0}
            onChange={(event) => onChange({ ...limits, minGain: Number(event.target.value) })}
            step={0.5}
            type="range"
            value={limits.minGain}
          />
          <span className="trade-finder__sheet-note">Under a point is sampling noise, and the board already sets those below a line.</span>
        </div>
        <div className="trade-finder__limit">
          <label className="trade-finder__limit-label" htmlFor="trade-finder-max-loss">
            <span>Their title falls at most</span>
            <span className="trade-finder__num">{limits.maxLoss == null ? 'any' : limits.maxLoss === 0 ? 'nothing' : `${limits.maxLoss.toFixed(1)} pp`}</span>
          </label>
          <input
            className="trade-finder__floor-input"
            id="trade-finder-max-loss"
            max={MAX_LOSS_TOP}
            min={0}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange({ ...limits, maxLoss: value >= MAX_LOSS_TOP ? null : value });
            }}
            step={0.5}
            type="range"
            value={limits.maxLoss == null ? MAX_LOSS_TOP : limits.maxLoss}
          />
          <span className="trade-finder__sheet-note">At nothing, only deals that lift both sides. All the way right, no limit.</span>
        </div>
        <label className="trade-finder__limit trade-finder__limit--toggle">
          <input
            checked={limits.hideLopsided}
            onChange={(event) => onChange({ ...limits, hideLopsided: event.target.checked })}
            type="checkbox"
          />
          <span>
            <span className="trade-finder__limit-label"><span>Hide lopsided deals</span></span>
            <span className="trade-finder__sheet-note">A manager who is out of the race has no title odds to lose, so a robbery of him passes the slider above. This catches it on roster value instead.</span>
          </span>
        </label>
        <button className="trade-finder__find" onClick={onClose} type="button">Show {kept} {kept === 1 ? 'deal' : 'deals'}</button>
      </div>
    </div>,
    document.body,
  );
}

/* ── The picker sheet: one for every leg ─────────────────────────────────── */

interface FinderPickerProps {
  slot: Slot;
  /** Opened from a leg's "+": stays open and toggles. Otherwise one pick closes it. */
  multi: boolean;
  query: FinderQuery;
  bootstrap: LeagueBootstrap;
  userTeam: ApiTeam;
  partners: ApiTeam[];
  futuresByRoster: Map<number, PricedFuture>;
  values: PlayerValues | null;
  outlooks: Map<string, PlayerOutlook> | null;
  basis: ValueBasis;
  week: number;
  onPick: (patch: Partial<FinderQuery>) => void;
  onClose: () => void;
}

function FinderPicker({ slot, multi, query, bootstrap, userTeam, partners, futuresByRoster, values, outlooks, basis, week, onPick, onClose }: FinderPickerProps) {
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

  const pick = (patch: Partial<FinderQuery>) => {
    onPick(patch);
    if (!multi) onClose();
  };

  const title = slot === 'partner' ? 'Partner' : slot === 'send' ? 'You send' : 'You get';
  const sublines = positionSublines({ team: userTeam, players, playerMeans: values, rosterPositions: bootstrap.league.rosterPositions });

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
      .map((entry) => ({ ...entry, mean: values?.[entry.id]?.mean ?? null }))
      .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))
      .slice(0, 40);
  }, [partners, players, query.partnerRosterIds, search, slot, userTeam, values]);

  return createPortal(
    <div className="trade-finder__scrim" onClick={onClose} role="presentation">
      <div aria-label={title} aria-modal="true" className="trade-finder__sheet" onClick={(event) => event.stopPropagation()} role="dialog">
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
                  onClick={() => pick({ partnerRosterIds: togglePartner(query.partnerRosterIds, team.rosterId) })}
                  type="button"
                >
                  <TeamAvatar size="md" team={team} />
                  <span className="trade-finder__item-copy">
                    <span className="trade-finder__item-name">{team.teamName}</span>
                    <span className="trade-finder__item-meta">{recordText(team.record)}</span>
                  </span>
                  <span className="trade-finder__item-stat">
                    <span className="trade-finder__tag">Title</span>
                    <span className="trade-finder__price">{future?.championOdds != null ? formatProbOrOdds(future.titleProb) : 'Off board'}</span>
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
                  {option === 'position' ? 'A position' : 'A player'}
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
                        onClick={() => pick(slot === 'send' ? { send: togglePosition(current, position) } : { get: togglePosition(current, position) })}
                        type="button"
                      >
                        <span className="trade-finder__tile-glyph">{position}</span>
                        <span className="trade-finder__tile-sub">{slot === 'get' ? (sub.starter ?? `${sub.rostered} rostered`) : `${sub.rostered} rostered`}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="trade-finder__sheet-note">
                  {slot === 'get'
                    ? `Every player you get comes from the position you pick. Under each is what your starter projects ${basis === 'ros' ? 'per game from here on' : 'this week'}.`
                    : 'Every player you send comes from the position you pick. Under each is how many you carry.'}
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
                <p className="trade-finder__list-caption">
                  <span>{slot === 'send' ? 'Yours' : query.partnerRosterIds.length > 0 ? 'Theirs' : 'The league'}</span>
                  <span>{basis === 'ros' ? 'Per game, rest of season' : 'Projected this week'}</span>
                </p>
                <div className="trade-finder__list">
                  {pool.map(({ id, team, mean }) => {
                    const player = players[id];
                    const on = current.kind === 'player' && current.ids.includes(id);
                    const outlook = outlooks?.get(id) ?? null;
                    const bye = player?.byeWeek != null && player.byeWeek >= week ? `Bye ${player.byeWeek}` : null;
                    return (
                      <button
                        aria-pressed={on}
                        className={['trade-finder__item', on ? 'trade-finder__item--on' : ''].filter(Boolean).join(' ')}
                        key={id}
                        onClick={() => pick(slot === 'send' ? { send: togglePlayer(current, id) } : { get: togglePlayer(current, id) })}
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
                            {[player?.position, player?.team, bye, slot === 'get' && query.partnerRosterIds.length !== 1 ? team.teamName : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {mean != null ? (
                          <span className="trade-finder__item-value">
                            <span className="trade-finder__num trade-finder__item-mean">{mean.toFixed(1)}</span>
                            {outlook ? <span className="trade-finder__rank">{outlook.position}{outlook.positionRank}</span> : null}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {pool.length === 0 ? <p className="trade-finder__sheet-note">Nobody by that name.</p> : null}
                </div>
              </>
            )}
          </>
        )}
        {multi ? (
          <div className="trade-finder__sheet-foot">
            <span className="trade-finder__sheet-note">
              {slot === 'partner'
                ? (query.partnerRosterIds.length === 0 ? 'Nobody picked: every manager.' : `${query.partnerRosterIds.length} picked. Tap again to remove.`)
                : current.kind === 'position'
                  ? `${current.positions.length} picked. Tap again to remove.`
                  : current.kind === 'player'
                    ? `${current.ids.length} picked. Tap again to remove.`
                    : 'Nothing picked: anything goes.'}
            </span>
            <button className="trade-finder__sheet-done" onClick={onClose} type="button">Done</button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
