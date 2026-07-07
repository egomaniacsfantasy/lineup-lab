/**
 * Maps provider-agnostic API payloads onto the existing UI types so every
 * screen renders real league data through the same components the demo uses.
 *
 * PROVISIONAL LINES (Phase A): until projections are imported (Phase B),
 * matchup odds are derived from team scoring history with a fixed weekly
 * sigma. They are flagged provisional in the UI and replaced wholesale by
 * the server engine in Phase B.
 */
import type {
  ApiCatalogPlayer,
  ApiMatchup,
  ApiTeam,
  LeagueBootstrap,
  LeaguePricing,
  PricedSide,
  ScheduleWeek,
} from '../services/leagueApi';
import type {
  BenchPlayer,
  LeagueConnection,
  MatchupData,
  MatchupLine,
  Player,
  Position,
  RosterSlot,
  SlotLabel,
} from '../types';
import type { LeagueFutureRow, LeagueWeekMatchup } from '../mocks/league';
import type { ScheduleGridItem } from '../components/season/ScheduleGrid';

const WEEKLY_SIGMA = 26; // fantasy team weekly stdev assumption for provisional lines

function normalCdf(z: number) {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

export function probabilityToAmerican(prob: number) {
  const p = Math.min(0.985, Math.max(0.015, prob));
  return p >= 0.5
    ? Math.round((-100 * p) / (1 - p))
    : Math.round((100 * (1 - p)) / p);
}

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function toPosition(position: string | null): Position {
  return (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(position ?? '')
    ? position
    : 'WR') as Position;
}

export function toPlayer(id: string, catalog: Record<string, ApiCatalogPlayer>): Player {
  const entry = catalog[id];
  const name = entry?.name ?? `Player ${id}`;
  const team = entry?.team ?? 'FA';

  return {
    id,
    name,
    shortName: entry?.position === 'DEF' ? name : shortName(name),
    position: toPosition(entry?.position ?? null),
    team,
    headshotUrl:
      entry?.position === 'DEF'
        ? `/api/img/logo/${id.toLowerCase()}`
        : `/api/img/headshot/${id}`,
    teamLogoUrl: `/api/img/logo/${team.toLowerCase()}`,
    bye: 0,
    isActive: entry?.status !== 'Inactive',
    injuryStatus: entry?.injuryStatus ?? undefined,
  };
}

function teamPpg(team: ApiTeam) {
  const games = team.record.wins + team.record.losses + team.record.ties;
  return games > 0 ? team.pointsFor / games : 100;
}

function recordLabel(team: ApiTeam) {
  const { wins, losses, ties } = team.record;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

/** Provisional matchup line from scoring history (see header comment). */
function provisionalLine(
  yoursPpg: number,
  theirsPpg: number,
): { yours: MatchupLine; opponent: MatchupLine } {
  const diff = yoursPpg - theirsPpg;
  const winProb = normalCdf(diff / (Math.SQRT2 * WEEKLY_SIGMA));

  const yours: MatchupLine = {
    moneyline: probabilityToAmerican(winProb),
    winProbability: Number((winProb * 100).toFixed(1)),
    projection: Number(yoursPpg.toFixed(1)),
    spread: Number(diff.toFixed(1)),
    total: Number((yoursPpg + theirsPpg).toFixed(1)),
  };
  const opponent: MatchupLine = {
    moneyline: probabilityToAmerican(1 - winProb),
    winProbability: Number(((1 - winProb) * 100).toFixed(1)),
    projection: Number(theirsPpg.toFixed(1)),
    spread: Number((-diff).toFixed(1)),
    total: yours.total,
  };

  return { yours, opponent };
}

export function getUserTeam(bootstrap: LeagueBootstrap): ApiTeam | null {
  return bootstrap.teams.find((t) => t.isUser) ?? null;
}

export function toLeagueConnection(bootstrap: LeagueBootstrap): LeagueConnection {
  const userTeam = getUserTeam(bootstrap);

  return {
    platform: 'sleeper',
    leagueId: bootstrap.league.id,
    leagueName: bootstrap.league.name,
    teamName: userTeam?.teamName ?? 'Your team',
    teamId: userTeam?.teamId ?? '',
    scoringFormat: bootstrap.league.scoringFamily,
    rosterPositions: bootstrap.league.rosterPositions.filter((p) => p !== 'BN'),
    totalTeams: bootstrap.league.totalTeams,
    currentWeek: bootstrap.week,
    roster: [],
  };
}

export function toLeagueFutures(
  bootstrap: LeagueBootstrap,
  pricing?: LeaguePricing | null,
): LeagueFutureRow[] {
  if (pricing?.available && pricing.futures) {
    return [...pricing.futures]
      .sort((a, b) => b.titleProb - a.titleProb)
      .map((f) => ({
        teamName: f.teamName,
        record:
          f.record.ties > 0
            ? `${f.record.wins}-${f.record.losses}-${f.record.ties}`
            : `${f.record.wins}-${f.record.losses}`,
        projRecord: f.projRecord,
        projWins: f.projWins,
        projLosses: f.projLosses,
        championOdds: f.championOdds,
        finalsOdds: f.finalsOdds,
        playoffOdds: f.playoffOdds,
        playoffProb: f.playoffProb,
        playoffClinched: f.playoffClinched,
        isUser: f.isUser,
      }));
  }

  return provisionalFutures(bootstrap);
}

function provisionalFutures(bootstrap: LeagueBootstrap): LeagueFutureRow[] {
  const teams = [...bootstrap.teams];
  const ppgs = teams.map(teamPpg);
  const mean = ppgs.reduce((a, b) => a + b, 0) / Math.max(1, ppgs.length);

  // Strength: 60% record, 40% scoring vs league average.
  const strengths = teams.map((team) => {
    const games = team.record.wins + team.record.losses + team.record.ties;
    const winPct = games > 0 ? team.record.wins / games : 0.5;
    const scoringEdge = mean > 0 ? teamPpg(team) / mean : 1;
    return 0.6 * winPct + 0.4 * (scoringEdge / 2);
  });
  const totalStrength = strengths.reduce((a, b) => a + b, 0) || 1;

  const rows = teams.map((team, index) => {
    const titleProb = Math.min(0.6, Math.max(0.01, strengths[index] / totalStrength));
    return { team, strength: strengths[index], titleProb };
  });

  rows.sort((a, b) => b.strength - a.strength);
  const playoffSlots = Math.min(6, Math.max(4, Math.round(bootstrap.league.totalTeams / 2)));

  return rows.map(({ team, titleProb }, position) => {
    const playoffProb = Math.min(
      0.98,
      Math.max(0.04, 1 - (position + 0.5) / Math.max(1, rows.length) + (playoffSlots / rows.length) * 0.5),
    );

    return {
      teamName: team.teamName,
      record: recordLabel(team),
      championOdds: probabilityToAmerican(titleProb),
      finalsOdds: probabilityToAmerican(Math.min(0.9, titleProb * 2)),
      playoffOdds: probabilityToAmerican(playoffProb),
      playoffProb: Number((playoffProb * 100).toFixed(1)),
      isUser: team.isUser,
    };
  });
}

export function toWeekMatchups(
  bootstrap: LeagueBootstrap,
  pricing?: LeaguePricing | null,
): LeagueWeekMatchup[] {
  const teamsByRoster = new Map(bootstrap.teams.map((t) => [t.rosterId, t]));
  const pricedByMatchup = new Map(
    pricing?.available ? (pricing.lines ?? []).map((l) => [l.matchupId, l]) : [],
  );
  const byMatchup = new Map<number, ApiMatchup[]>();

  bootstrap.matchups.forEach((m) => {
    if (m.matchupId == null) return; // bye / unscheduled
    const list = byMatchup.get(m.matchupId) ?? [];
    list.push(m);
    byMatchup.set(m.matchupId, list);
  });

  const result: LeagueWeekMatchup[] = [];

  byMatchup.forEach((pair) => {
    if (pair.length !== 2) return;
    const [a, b] = pair;
    const teamA = teamsByRoster.get(a.rosterId);
    const teamB = teamsByRoster.get(b.rosterId);
    if (!teamA || !teamB) return;

    const priced = pricedByMatchup.get(a.matchupId);
    const line = provisionalLine(teamPpg(teamA), teamPpg(teamB));
    const oddsA = priced?.sides[String(a.rosterId)]?.moneyline ?? line.yours.moneyline;
    const oddsB = priced?.sides[String(b.rosterId)]?.moneyline ?? line.opponent.moneyline;

    result.push({
      teamA: teamA.teamName,
      teamARecord: recordLabel(teamA),
      teamAOdds: oddsA,
      teamB: teamB.teamName,
      teamBRecord: recordLabel(teamB),
      teamBOdds: oddsB,
      isUserGame: teamA.isUser || teamB.isUser,
    });
  });

  return result;
}

function slotLabels(rosterPositions: string[]): SlotLabel[] {
  return rosterPositions
    .filter((p) => p !== 'BN' && p !== 'IR' && p !== 'TAXI')
    .map((p) => {
      if (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(p)) return p as SlotLabel;
      return 'FLEX'; // FLEX / SUPER_FLEX / WRRB_FLEX / REC_FLEX all render as FLEX
    });
}

function sideToLine(side: PricedSide): MatchupLine {
  return {
    moneyline: side.moneyline,
    winProbability: side.winProbability,
    projection: side.projection,
    spread: side.spread,
    total: side.total,
  };
}

export function toMatchupData(
  bootstrap: LeagueBootstrap,
  pricing?: LeaguePricing | null,
): MatchupData | null {
  const userTeam = getUserTeam(bootstrap);
  if (!userTeam) return null;

  const userMatchup = bootstrap.matchups.find((m) => m.rosterId === userTeam.rosterId);
  const oppMatchup = userMatchup
    ? bootstrap.matchups.find(
        (m) => m.matchupId === userMatchup.matchupId && m.rosterId !== userTeam.rosterId,
      )
    : undefined;
  const oppTeam = oppMatchup
    ? bootstrap.teams.find((t) => t.rosterId === oppMatchup.rosterId)
    : undefined;

  // Off-season / schedule-pending: no scheduled opponent. Build the board
  // from the real roster, priced against the league-median team (honest
  // stand-in; the UI never names a fabricated opponent).
  if (!userMatchup || !oppMatchup || !oppTeam) {
    if (!pricing?.available || userTeam.starters.length === 0) return null;
    return buildOffseasonMatchupData(bootstrap, pricing, userTeam);
  }

  const labels = slotLabels(bootstrap.league.rosterPositions);
  const priced = pricing?.available ? pricing : null;
  const pricedLine = priced?.lines?.find((l) => l.matchupId === userMatchup.matchupId);
  const playerMeans = priced?.playerMeans ?? {};
  const swapsBySlot = new Map<number, NonNullable<LeaguePricing['userSwaps']>>();
  (priced?.userSwaps ?? []).forEach((swap) => {
    const list = swapsBySlot.get(swap.slotIndex) ?? [];
    list.push(swap);
    swapsBySlot.set(swap.slotIndex, list);
  });

  const projectionFor = (playerId: string, matchup: ApiMatchup) =>
    playerMeans[playerId]?.mean ?? matchup.playersPoints[playerId] ?? 0;

  const buildRoster = (matchup: ApiMatchup, isUserSide: boolean): RosterSlot[] =>
    matchup.starters.map((playerId, index) => {
      const projection = projectionFor(playerId, matchup);
      const yoursSide = pricedLine?.sides[String(matchup.rosterId)];
      const swaps = isUserSide ? (swapsBySlot.get(index) ?? []) : [];

      const alternatives = swaps.map((swap) => {
        const altProjection = swap.benchMean;
        return {
          player: toPlayer(swap.benchId, bootstrap.players),
          projection: altProjection,
          floor: Number((altProjection * 0.6).toFixed(1)),
          ceiling: Number((altProjection * 1.45).toFixed(1)),
          resultingLine: {
            moneyline: swap.resultingMoneyline,
            winProbability: swap.resultingWinProb,
            projection: swap.resultingProjection,
            spread: Number(((yoursSide?.spread ?? 0) + altProjection - swap.starterMean).toFixed(1)),
            total: Number(((yoursSide?.total ?? 0) + altProjection - swap.starterMean).toFixed(1)),
          },
          deltaWinProbability: swap.deltaWinProb,
          gameLine: `${bootstrap.players[swap.benchId]?.team ?? 'FA'} game, line pending`,
        };
      });

      return {
        slotLabel: labels[index] ?? 'FLEX',
        starter: toPlayer(playerId, bootstrap.players),
        projection,
        floor: Number((projection * 0.6).toFixed(1)),
        ceiling: Number((projection * 1.45).toFixed(1)),
        isDecisionSlot: alternatives.length > 0,
        alternatives,
      };
    });

  const buildBench = (team: ApiTeam, matchup: ApiMatchup): BenchPlayer[] =>
    team.players
      .filter((id) => !matchup.starters.includes(id))
      .map((id) => ({
        player: toPlayer(id, bootstrap.players),
        projection: projectionFor(id, matchup),
      }));

  const userSide = pricedLine?.sides[String(userTeam.rosterId)];
  const oppSide = pricedLine?.sides[String(oppTeam.rosterId)];
  const line =
    userSide && oppSide
      ? { yours: sideToLine(userSide), opponent: sideToLine(oppSide) }
      : provisionalLine(teamPpg(userTeam), teamPpg(oppTeam));

  return {
    week: bootstrap.week,
    scoringFormat: bootstrap.league.scoringFamily,
    yourTeam: {
      managerKey: userTeam.ownerId,
      teamName: userTeam.teamName,
      managerName: userTeam.ownerName,
      record: recordLabel(userTeam),
      avatarUrl: userTeam.avatarUrl,
      roster: buildRoster(userMatchup, true),
      bench: buildBench(userTeam, userMatchup),
    },
    opponentTeam: {
      managerKey: oppTeam.ownerId,
      teamName: oppTeam.teamName,
      managerName: oppTeam.ownerName,
      record: recordLabel(oppTeam),
      avatarUrl: oppTeam.avatarUrl,
      roster: buildRoster(oppMatchup, false),
      bench: [],
    },
    baseline: line,
  };
}

function buildOffseasonMatchupData(
  bootstrap: LeagueBootstrap,
  pricing: LeaguePricing,
  userTeam: ApiTeam,
): MatchupData {
  const labels = slotLabels(bootstrap.league.rosterPositions);
  const playerMeans = pricing.playerMeans ?? {};
  const median = pricing.leagueMedian ?? { mean: 100, sigma: 25 };
  const swapsBySlot = new Map<number, NonNullable<LeaguePricing['userSwaps']>>();
  (pricing.userSwaps ?? []).forEach((swap) => {
    const list = swapsBySlot.get(swap.slotIndex) ?? [];
    list.push(swap);
    swapsBySlot.set(swap.slotIndex, list);
  });

  const userMean = userTeam.starters.reduce(
    (sum, id) => sum + (playerMeans[id]?.mean ?? 0),
    0,
  );
  const diff = userMean - median.mean;
  const sigma = Math.sqrt(2) * Math.max(10, median.sigma);
  const winProb = normalCdf(diff / sigma);

  const yours: MatchupLine = {
    moneyline: probabilityToAmerican(winProb),
    winProbability: Number((winProb * 100).toFixed(1)),
    projection: Number(userMean.toFixed(1)),
    spread: Number(diff.toFixed(1)),
    total: Number((userMean + median.mean).toFixed(1)),
  };
  const opponent: MatchupLine = {
    moneyline: probabilityToAmerican(1 - winProb),
    winProbability: Number(((1 - winProb) * 100).toFixed(1)),
    projection: median.mean,
    spread: Number((-diff).toFixed(1)),
    total: yours.total,
  };

  const roster: RosterSlot[] = userTeam.starters.map((playerId, index) => {
    const projection = playerMeans[playerId]?.mean ?? 0;
    const swaps = swapsBySlot.get(index) ?? [];
    const alternatives = swaps.map((swap) => ({
      player: toPlayer(swap.benchId, bootstrap.players),
      projection: swap.benchMean,
      floor: Number((swap.benchMean * 0.6).toFixed(1)),
      ceiling: Number((swap.benchMean * 1.45).toFixed(1)),
      resultingLine: {
        moneyline: swap.resultingMoneyline,
        winProbability: swap.resultingWinProb,
        projection: swap.resultingProjection,
        spread: Number((diff + swap.benchMean - swap.starterMean).toFixed(1)),
        total: Number((yours.total + swap.benchMean - swap.starterMean).toFixed(1)),
      },
      deltaWinProbability: swap.deltaWinProb,
      gameLine: `${bootstrap.players[swap.benchId]?.team ?? 'FA'} game, line pending`,
    }));

    return {
      slotLabel: labels[index] ?? 'FLEX',
      starter: toPlayer(playerId, bootstrap.players),
      projection,
      floor: Number((projection * 0.6).toFixed(1)),
      ceiling: Number((projection * 1.45).toFixed(1)),
      isDecisionSlot: alternatives.length > 0,
      alternatives,
    };
  });

  const bench: BenchPlayer[] = userTeam.players
    .filter((id) => !userTeam.starters.includes(id))
    .map((id) => ({
      player: toPlayer(id, bootstrap.players),
      projection: playerMeans[id]?.mean ?? 0,
    }));

  return {
    week: 1,
    scoringFormat: bootstrap.league.scoringFamily,
    yourTeam: {
      managerKey: userTeam.ownerId,
      teamName: userTeam.teamName,
      managerName: userTeam.ownerName,
      record: recordLabel(userTeam),
      roster,
      bench,
    },
    opponentTeam: {
      managerKey: null,
      teamName: 'League median',
      managerName: 'Field',
      record: '—',
      roster: [],
      bench: [],
    },
    baseline: { yours, opponent },
  };
}

export function toScheduleItems(
  schedule: ScheduleWeek[],
  bootstrap: LeagueBootstrap,
  pricing?: LeaguePricing | null,
): ScheduleGridItem[] {
  const userTeam = getUserTeam(bootstrap);
  if (!userTeam) return [];

  const teamsByRoster = new Map(bootstrap.teams.map((t) => [t.rosterId, t]));
  const lastScored = bootstrap.league.lastScoredWeek ?? 0;
  // engine-priced week-by-week lines (projection-based, not record-based)
  const pricedWeeks = new Map(
    (pricing?.available ? pricing.weeklyLines ?? [] : []).map((w) => [w.week, w]),
  );

  return schedule
    .map((weekEntry): ScheduleGridItem | null => {
      const mine = weekEntry.matchups.find((m) => m.rosterId === userTeam.rosterId);

      if (!mine || mine.matchupId == null) {
        return {
          week: weekEntry.week,
          opponent: 'Bye',
          opponentRecord: '',
          status: 'bye',
        };
      }

      const theirs = weekEntry.matchups.find(
        (m) => m.matchupId === mine.matchupId && m.rosterId !== mine.rosterId,
      );
      const opp = theirs ? teamsByRoster.get(theirs.rosterId) : undefined;
      if (!opp || !theirs) return null;

      const played = weekEntry.week <= lastScored;
      const line = provisionalLine(teamPpg(userTeam), teamPpg(opp));

      if (played) {
        const won = mine.points >= theirs.points;
        return {
          week: weekEntry.week,
          opponent: opp.teamName,
          opponentRecord: recordLabel(opp),
          status: won ? 'win' : 'loss',
          score: `${mine.points.toFixed(1)} - ${theirs.points.toFixed(1)}`,
        };
      }

      const priced = pricedWeeks.get(weekEntry.week);
      const isPlayoff =
        typeof bootstrap.league.playoffWeekStart === 'number' &&
        weekEntry.week >= bootstrap.league.playoffWeekStart;

      return {
        week: weekEntry.week,
        opponent: opp.teamName,
        opponentRecord: recordLabel(opp),
        status: weekEntry.week === bootstrap.week ? 'live' : 'projected',
        isHome: true,
        isPlayoff,
        yourLine: priced?.moneyline ?? line.yours.moneyline,
        winProb: priced?.winProb,
        projection: priced?.projection,
        opponentProjection: priced?.opponentProjection,
        note: priced?.note,
      };
    })
    .filter((item): item is ScheduleGridItem => item !== null);
}
