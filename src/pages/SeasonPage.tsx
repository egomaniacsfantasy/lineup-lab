import { useMemo } from 'react';
import { DraftWrappedCard } from '../components/season/DraftWrappedCard';
import { ScheduleGrid, type ScheduleGridItem } from '../components/season/ScheduleGrid';
import { SeasonHeadline } from '../components/season/SeasonHeadline';
import {
  MOCK_DRAFT_WRAPPED,
  MOCK_SEASON_OUTLOOK,
  MOCK_SCHEDULE_PREVIEW,
} from '../mocks';
import type { DraftWrappedData } from '../types';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import {
  getUserTeam,
  toLeagueFutures,
  toPlayer,
  toScheduleItems,
} from '../adapters/connectedLeague';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import './SeasonPage.css';

export function SeasonPage() {
  const { bootstrap, schedule, pricing } = useLeagueConnection();

  const connectedSeason = useMemo(() => {
    if (!bootstrap) return null;
    const userTeam = getUserTeam(bootstrap);
    if (!userTeam) return null;
    const futures = toLeagueFutures(bootstrap, pricing);
    const userRow = futures.find((row) => row.isUser) ?? null;
    const rank = futures.findIndex((row) => row.isUser) + 1;

    return {
      userTeam,
      userRow,
      rank: rank > 0 ? rank : bootstrap.league.totalTeams,
      scheduleItems: schedule ? toScheduleItems(schedule, bootstrap, pricing) : [],
    };
  }, [bootstrap, schedule, pricing]);

  const preseasonSchedule = useMemo<ScheduleGridItem[]>(
    () =>
      MOCK_SCHEDULE_PREVIEW.map((item) => ({
        week: item.week,
        opponent: item.opponent,
        opponentRecord: item.opponentRecord,
        status: item.opponent === 'BYE' ? 'bye' : 'projected',
        yourLine: item.yourLine,
        isHome: item.isHome,
      })),
    [],
  );


  if (connectedSeason && connectedSeason.userRow) {
    const { userTeam, userRow, rank, scheduleItems } = connectedSeason;
    const record = `${userTeam.record.wins}-${userTeam.record.losses}`;

    const played = userTeam.record.wins + userTeam.record.losses + userTeam.record.ties;
    const remaining = Math.max(
      0,
      (bootstrap?.league.regularSeasonWeeks ?? played) - played,
    );
    const losses = userTeam.record.losses;
    const recordRange = {
      best: `${userTeam.record.wins + remaining}-${losses}`,
      worst: `${userTeam.record.wins}-${losses + remaining}`,
      median: `${userTeam.record.wins + Math.round(remaining / 2)}-${losses + Math.floor(remaining / 2)}`,
    };
    const userFuture = pricing?.available
      ? pricing.futures?.find((future) => future.isUser)
      : undefined;
    const real = pricing?.available ? pricing.draftWrapped : null;
    const realWrapped: DraftWrappedData | null =
      real && real.boldestPick && bootstrap
        ? {
            teamName: real.teamName,
            leagueName: real.leagueName,
            championshipOdds: userFuture?.championOdds ?? userRow.championOdds,
            projectedRecord: userFuture?.projRecord ?? record,
            recordRange,
            leagueRank: rank,
            boldestPick: {
              player: toPlayer(real.boldestPick.playerId, bootstrap.players),
              pickNumber: real.boldestPick.pickNo,
              adpDelta: real.boldestPick.reach,
            },
            toughestMatchup: real.toughestWeek
              ? { week: real.toughestWeek.week, odds: real.toughestWeek.odds, opponent: real.toughestWeek.opponent }
              : { week: 0, odds: 100, opponent: '—' },
            easiestMatchup: real.easiestWeek
              ? { week: real.easiestWeek.week, odds: real.easiestWeek.odds, opponent: real.easiestWeek.opponent }
              : { week: 0, odds: -100, opponent: '—' },
            rosterGrade: real.grade,
          }
        : null;

    return (
      <div className="season-page">
        <h1 className="visually-hidden">Season futures</h1>

        {!pricing?.available ? (
          <SeasonalNotice>
            Season futures are provisional (scoring history only) until
            projections are imported.
          </SeasonalNotice>
        ) : null}

        <SeasonHeadline
          championshipOdds={userRow.championOdds}
          leagueRank={rank}
          live={bootstrap !== null && bootstrap.league.status === 'in_season'}
          playoffProbability={userRow.playoffProb}
          recordLabel={userFuture ? 'Projected record' : 'Record'}
          recordRange={recordRange}
          recordValue={userFuture?.projRecord ?? record}
          title={`Your ${bootstrap?.league.season} season futures`}
        />

        {realWrapped ? (
          <DraftWrappedCard draftWrapped={realWrapped} onShare={() => {}} />
        ) : null}

        {real && real.unpricedPicks > 0 ? (
          <SeasonalNotice>
            {real.unpricedPicks} of your {real.totalPicks} draft picks are
            outside the projection sheet, so the grade is reduced-confidence.
          </SeasonalNotice>
        ) : null}

        {scheduleItems.length > 0 ? (
          <ScheduleGrid items={scheduleItems} title="Schedule" />
        ) : (
          <SeasonalNotice>Loading your schedule…</SeasonalNotice>
        )}
      </div>
    );
  }


  return (
    <div className="season-page">
      <h1 className="visually-hidden">Season futures</h1>

      <SeasonHeadline
        championshipOdds={MOCK_SEASON_OUTLOOK.championshipOdds}
        leagueRank={MOCK_DRAFT_WRAPPED.leagueRank}
        playoffProbability={MOCK_SEASON_OUTLOOK.playoffProbability}
        recordLabel="Projected record"
        recordRange={MOCK_SEASON_OUTLOOK.recordRange}
        recordValue={`${MOCK_SEASON_OUTLOOK.projectedRecord.wins}-${MOCK_SEASON_OUTLOOK.projectedRecord.losses}`}
        title="Your 2026 season futures"
      />

      <DraftWrappedCard
        draftWrapped={MOCK_DRAFT_WRAPPED}
        onShare={() => {}}
      />

      <ScheduleGrid
        items={preseasonSchedule}
        title="Upcoming schedule"
      />
    </div>
  );
}
