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
import './SeasonPage.css';

export function SeasonPage() {
  const { mode } = useSeasonMode();

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

  return (
    <div className="season-page">
      <h1 className="visually-hidden">Season outlook</h1>

      {mode === 'preseason' ? (
        <>
          <SeasonHeadline
            championshipOdds={MOCK_SEASON_OUTLOOK.championshipOdds}
            leagueRank={MOCK_DRAFT_WRAPPED.leagueRank}
            playoffProbability={MOCK_SEASON_OUTLOOK.playoffProbability}
            recordLabel="Projected record"
            recordRange={MOCK_SEASON_OUTLOOK.recordRange}
            recordValue={`${MOCK_SEASON_OUTLOOK.projectedRecord.wins}-${MOCK_SEASON_OUTLOOK.projectedRecord.losses}`}
            title="Your 2026 season outlook"
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
            title={`Your season · week ${MOCK_MATCHUP.week}`}
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
