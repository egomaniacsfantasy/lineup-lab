import { useMemo, useState } from 'react';
import { DraftWrappedCard } from '../components/season/DraftWrappedCard';
import { ScheduleGrid, type ScheduleGridItem } from '../components/season/ScheduleGrid';
import { SeasonHeadline } from '../components/season/SeasonHeadline';
import { WeekDetailModal } from '../components/season/WeekDetailModal';
import {
  MOCK_DRAFT_WRAPPED,
  MOCK_SEASON_OUTLOOK,
  MOCK_SCHEDULE_PREVIEW,
} from '../mocks';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import {
  getUserTeam,
  toLeagueFutures,
  toScheduleItems,
} from '../adapters/connectedLeague';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import './SeasonPage.css';

export function SeasonPage() {
  const { bootstrap, schedule, pricing } = useLeagueConnection();
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

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
    // Record range is only meaningful once games have been played; at 0-0 it
    // spans the whole season (0-15 to 15-0), which reads as broken.
    const showRange = played > 0;

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
          recordRange={showRange ? recordRange : undefined}
          recordValue={userFuture?.projRecord ?? record}
          title={`Your ${bootstrap?.league.season} season futures`}
        />

        {scheduleItems.length > 0 ? (
          <ScheduleGrid
            items={scheduleItems}
            onSelectWeek={(item) => setSelectedWeek(item.week)}
            title="Schedule"
          />
        ) : (
          <SeasonalNotice>Loading your schedule…</SeasonalNotice>
        )}

        {selectedWeek !== null ? (
          <WeekDetailModal
            line={
              pricing?.available
                ? pricing.weeklyLines?.find((w) => w.week === selectedWeek) ?? null
                : null
            }
            onClose={() => setSelectedWeek(null)}
            userTeamName={userTeam.teamName}
            week={selectedWeek}
          />
        ) : null}
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
