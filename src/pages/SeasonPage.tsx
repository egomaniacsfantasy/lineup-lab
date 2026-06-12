import { useMemo } from 'react';
import { CascadePanel } from '../components/season/CascadePanel';
import { DraftWrappedCard } from '../components/season/DraftWrappedCard';
import { ScheduleGrid, type ScheduleGridItem } from '../components/season/ScheduleGrid';
import { SeasonHeadline } from '../components/season/SeasonHeadline';
import { useSeasonMode } from '../hooks/useSeasonMode';
import {
  MOCK_CASCADE_SCENARIOS,
  MOCK_DRAFT_WRAPPED,
  MOCK_INSEASON_SCHEDULE,
  MOCK_MATCHUP,
  MOCK_SEASON_OUTLOOK,
  MOCK_SCHEDULE_PREVIEW,
  MOCK_WEEKLY_TRAJECTORY,
} from '../mocks';
import { getStoredCascadeScenarioLabel } from '../utils/seasonSelection';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import {
  getUserTeam,
  toLeagueFutures,
  toScheduleItems,
} from '../adapters/connectedLeague';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import './SeasonPage.css';

export function SeasonPage() {
  const { mode } = useSeasonMode();
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
      scheduleItems: schedule ? toScheduleItems(schedule, bootstrap) : [],
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

  const activeScenarioLabel = getStoredCascadeScenarioLabel();

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
          recordLabel="Record"
          recordRange={recordRange}
          recordValue={record}
          title={`Your ${bootstrap?.league.season} season · week ${bootstrap?.week}`}
        />

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

      {mode === 'preseason' ? (
        <>
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
        </>
      ) : (
        <>
          <SeasonHeadline
            championshipOdds={MOCK_SEASON_OUTLOOK.championshipOdds}
            leagueRank={MOCK_DRAFT_WRAPPED.leagueRank}
            live
            playoffProbability={MOCK_SEASON_OUTLOOK.playoffProbability}
            recordLabel="Record"
            recordRange={MOCK_SEASON_OUTLOOK.recordRange}
            recordValue={MOCK_MATCHUP.yourTeam.record}
            title={`Your 2024 replay · week ${MOCK_MATCHUP.week}`}
          />

          <CascadePanel
            activeScenarioLabel={activeScenarioLabel}
            scenarios={MOCK_CASCADE_SCENARIOS}
            trajectory={MOCK_WEEKLY_TRAJECTORY}
          />

          <ScheduleGrid
            items={MOCK_INSEASON_SCHEDULE}
            title="Schedule"
          />
        </>
      )}
    </div>
  );
}
