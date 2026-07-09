import { getPlayerManifestEntry } from '../data/playerManifest';
import type { TeamGameContext } from '../services/nflSchedule';
import type { Player, RosterSlot } from '../types';

type NflScheduleHookState = {
  status: 'loading' | 'ready' | 'unavailable';
  byTeam: Map<string, TeamGameContext>;
  byes: Set<string>;
};

export type GameContextSource =
  | { mode: 'demo' }
  | {
      mode: 'live';
      status: NflScheduleHookState['status'];
      byTeam: Map<string, TeamGameContext>;
      byes: Set<string>;
    };

interface PlayerGameContextUnavailable {
  contextAvailable: false;
}

interface PlayerGameContextAvailable {
  contextAvailable: true;
  bye: boolean;
  kickoff: string;
  kickoffIso: string | null;
  gameLine: string;
  matchup: string;
  opponent: string | null;
  homeAway: 'home' | 'away' | null;
  gameId: string | null;
}

type PlayerGameContext = PlayerGameContextUnavailable | PlayerGameContextAvailable;

function formatMatchupForMeta(gameLine: string) {
  const match = gameLine.match(/^([A-Z]{2,3})\s[+-].*?\s(@|vs)\s([A-Z]{2,3})$/);

  if (!match) {
    return gameLine.split(' · ')[0] ?? gameLine;
  }

  return `${match[1]} ${match[2]} ${match[3]}`;
}

export function formatKickoffTime(iso: string | number | Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\s/g, ' ');
}

function formatKickoff(iso: string) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(new Date(iso));

  return `${weekday} ${formatKickoffTime(iso)}`;
}

function kickoffOrder(iso: string | null, fallback: number) {
  return iso ? new Date(iso).getTime() : fallback;
}

export function getGameContextSource(
  mode: 'live' | 'demo',
  schedule?: NflScheduleHookState,
): GameContextSource {
  if (mode === 'demo') return { mode: 'demo' };
  return {
    mode: 'live',
    status: schedule?.status ?? 'unavailable',
    byTeam: schedule?.byTeam ?? new Map(),
    byes: schedule?.byes ?? new Set(),
  };
}

export function getPlayerContext(
  player: Player,
  source: GameContextSource = { mode: 'demo' },
): PlayerGameContext {
  if (source.mode === 'demo') {
    const entry = getPlayerManifestEntry(player.slug ?? player.id);
    const kickoff = entry?.week8_2024.kickoff ?? 'Sun 1pm';
    const gameLine = entry?.week8_2024.gameLine ?? 'Line pending';

    return {
      contextAvailable: true,
      bye: false,
      kickoff,
      kickoffIso: null,
      gameLine,
      matchup: formatMatchupForMeta(gameLine),
      opponent: entry?.week8_2024.opponent ?? null,
      homeAway: null,
      gameId: null,
    };
  }

  if (source.status !== 'ready') {
    return { contextAvailable: false };
  }

  const team = player.team?.toUpperCase();
  if (!team || team === 'FA') {
    return { contextAvailable: false };
  }

  if (source.byes.has(team)) {
    return {
      contextAvailable: true,
      bye: true,
      kickoff: 'BYE',
      kickoffIso: null,
      gameLine: `${team} BYE`,
      matchup: 'BYE',
      opponent: null,
      homeAway: null,
      gameId: null,
    };
  }

  const game = source.byTeam.get(team);
  if (!game) {
    return { contextAvailable: false };
  }

  const venue = game.homeAway === 'home' ? 'vs' : '@';
  return {
    contextAvailable: true,
    bye: false,
    kickoff: formatKickoff(game.kickoffIso),
    kickoffIso: game.kickoffIso,
    gameLine: `${team} ${venue} ${game.opponent}`,
    matchup: `${venue} ${game.opponent}`,
    opponent: game.opponent,
    homeAway: game.homeAway,
    gameId: game.gameId,
  };
}

export function buildExposureWindows(roster: RosterSlot[], source: GameContextSource = { mode: 'demo' }) {
  const grouped = new Map<
    string,
    {
      key: string;
      dayLabel: string;
      detail: string;
      lockLabel: string;
      projection: number;
      players: Player[];
      order: number;
    }
  >();

  const dayOrder: Record<string, number> = {
    THU: 0,
    FRI: 1,
    SAT: 2,
    SUN: 3,
    MON: 4,
  };

  for (const slot of roster) {
    const context = getPlayerContext(slot.starter, source);
    if (!context.contextAvailable) {
      return { contextAvailable: false as const, windows: [] };
    }

    const [dayPart, ...timeParts] = context.kickoff.split(' ');
    const dayLabel = dayPart.slice(0, 3).toUpperCase();
    const timeLabel = timeParts.join(' ').trim();
    const key = context.kickoffIso ?? `${dayLabel}-${timeLabel}`;
    const existing = grouped.get(key);
    const lockLabel = dayLabel === 'THU' ? `${timeLabel} tonight` : timeLabel;

    if (existing) {
      existing.projection += slot.projection;
      existing.players.push(slot.starter);
      continue;
    }

    grouped.set(key, {
      key,
      dayLabel,
      detail: context.matchup,
      lockLabel,
      projection: slot.projection,
      players: [slot.starter],
      order: kickoffOrder(context.kickoffIso, dayOrder[dayLabel] ?? 10),
    });
  }

  const totalProjection = roster.reduce((sum, slot) => sum + slot.projection, 0);

  const windows = Array.from(grouped.values())
    .sort((left, right) => left.order - right.order)
    .map((window) => {
      const matchupCount = new Set(
        window.players
          .map((player) => getPlayerContext(player, source))
          .filter((context): context is PlayerGameContextAvailable => context.contextAvailable)
          .map((context) => context.matchup),
      ).size;

      return {
        ...window,
        share: Math.round((window.projection / totalProjection) * 100),
        detail:
          window.players.length === 1
            ? `${window.detail} · locks ${window.lockLabel}`
            : `${matchupCount} ${matchupCount === 1 ? 'game' : 'games'} · locks ${window.lockLabel}`,
      };
    });

  return { contextAvailable: true as const, windows };
}
