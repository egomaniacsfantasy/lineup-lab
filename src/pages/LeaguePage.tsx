import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { EspnConnect } from '../components/league/EspnConnect';
import { LeagueFutures } from '../components/league/LeagueFutures';
import { MatchupSlate } from '../components/league/MatchupSlate';
import { PlayoffSettings } from '../components/league/PlayoffSettings';
import { StandingsTable } from '../components/league/StandingsTable';
import { TradeTargetTeaser } from '../components/league/TradeTargetTeaser';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { DraftWrappedCard } from '../components/season/DraftWrappedCard';
import { ScheduleGrid, type ScheduleGridItem } from '../components/season/ScheduleGrid';
import { SeasonHeadline } from '../components/season/SeasonHeadline';
import { WeekDetailModal } from '../components/season/WeekDetailModal';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useSeasonMode } from '../hooks/useSeasonMode';
import {
  getUserTeam,
  toLeagueConnection,
  toLeagueFutures,
  toScheduleItems,
  toWeekMatchups,
} from '../adapters/connectedLeague';
import {
  MOCK_DRAFT_WRAPPED,
  MOCK_LEAGUE,
  MOCK_LEAGUE_FUTURES,
  MOCK_SCHEDULE_PREVIEW,
  MOCK_SEASON_OUTLOOK,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WEEK_MATCHUPS,
} from '../mocks';
import { formatAmericanOdds } from '../utils/formatOdds';
import { PROVIDER_LABEL } from '../utils/provider';
import { shareText } from '../utils/share';
import './ConnectPage.css';
import './LeaguePage.css';

type ConnectFlow = 'none' | 'sleeper' | 'espn';
type LeagueView = 'this-week' | 'standings' | 'futures' | 'schedule';

const LEAGUE_VIEWS: Array<{ key: LeagueView; label: string }> = [
  { key: 'this-week', label: 'This week' },
  { key: 'standings', label: 'Standings' },
  { key: 'futures', label: 'Futures' },
  { key: 'schedule', label: 'Schedule' },
];

function flowFromHash(hash: string): ConnectFlow | null {
  if (hash === '#connect-sleeper') return 'sleeper';
  if (hash === '#connect-espn') return 'espn';
  return null;
}

function parseLeagueView(raw: string | null): LeagueView {
  return LEAGUE_VIEWS.some((view) => view.key === raw)
    ? (raw as LeagueView)
    : 'this-week';
}

function recordLabel(team: { record: { wins: number; losses: number; ties: number } }) {
  const { wins, losses, ties } = team.record;
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function LeaguePage() {
  const { mode } = useSeasonMode();
  const { stored, bootstrap, schedule, pricing, lineHistory, isLoading, error, connect } =
    useLeagueConnection();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showWizard, setShowWizard] = useState(false);
  const [manualFlow, setManualFlow] = useState<ConnectFlow>('none');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const activeView = parseLeagueView(searchParams.get('view'));
  const isReconnectState = Boolean(stored && !bootstrap && !isLoading && error);
  const hasConnectHash = location.hash.startsWith('#connect');
  const isWizardOpen = showWizard || hasConnectHash || isReconnectState;
  const flow =
    flowFromHash(location.hash) ??
    (showWizard || hasConnectHash || isReconnectState ? manualFlow : 'none');

  const connected = useMemo(() => {
    if (!bootstrap) return null;
    return {
      connection: toLeagueConnection(bootstrap),
      futures: toLeagueFutures(bootstrap, pricing),
      slate: toWeekMatchups(bootstrap, pricing),
    };
  }, [bootstrap, pricing]);

  const connectedSeason = useMemo(() => {
    if (!bootstrap) return null;
    const userTeam = getUserTeam(bootstrap);
    if (!userTeam) return null;
    const futures = toLeagueFutures(bootstrap, pricing);
    const scheduleItems = schedule ? toScheduleItems(schedule, bootstrap, pricing) : [];
    const userFuture = futures.find((row) => row.teamName === userTeam.teamName);
    const rank =
      userFuture != null
        ? futures.findIndex((row) => row.teamName === userFuture.teamName) + 1
        : Math.max(1, Math.round(bootstrap.teams.length / 2));
    const record = recordLabel(userTeam);

    return {
      rank,
      record,
      scheduleItems,
      userFuture,
      userTeam,
    };
  }, [bootstrap, pricing, schedule]);

  const preseasonSchedule: ScheduleGridItem[] = useMemo(
    () =>
      MOCK_SCHEDULE_PREVIEW.map((item) => ({
        ...item,
        status: item.opponent === 'BYE' ? 'bye' : 'projected',
      })),
    [],
  );

  const liveBoardLine = useMemo(() => {
    const userGame = connected?.slate.find((matchup) => matchup.isUserGame);
    if (!userGame) return null;
    if (userGame.teamAIsUser) {
      return {
        moneyline: userGame.teamAOdds,
        winProb: userGame.teamAWinProb,
        projection: userGame.teamAProjection,
        opponentProjection: userGame.teamBProjection,
      };
    }
    if (userGame.teamBIsUser) {
      return {
        moneyline: userGame.teamBOdds,
        winProb: userGame.teamBWinProb,
        projection: userGame.teamBProjection,
        opponentProjection: userGame.teamAProjection,
      };
    }
    return null;
  }, [connected?.slate]);

  const connectedScheduleItems = useMemo(() => {
    if (!connectedSeason) return [];
    if (!bootstrap || !liveBoardLine) return connectedSeason.scheduleItems;
    return connectedSeason.scheduleItems.map((item) =>
      item.week === bootstrap.week && item.status === 'live'
        ? {
            ...item,
            yourLine: liveBoardLine.moneyline,
            winProb: liveBoardLine.winProb ?? item.winProb,
            projection: liveBoardLine.projection ?? item.projection,
            opponentProjection: liveBoardLine.opponentProjection ?? item.opponentProjection,
          }
        : item,
    );
  }, [bootstrap, connectedSeason, liveBoardLine]);

  const handleShareDraftWrapped = async () => {
    const message = `My 2026 season outlook: ${MOCK_DRAFT_WRAPPED.projectedRecord}, ${formatAmericanOdds(
      MOCK_DRAFT_WRAPPED.championshipOdds,
    )} to win it all.`;
    try {
      await shareText({
        title: 'Draft wrapped',
        text: message,
      });
    } catch {
      // Native share is optional; the card remains useful without it.
    }
  };

  const setLeagueView = (view: LeagueView) => {
    if (view === 'this-week') {
      setSearchParams({});
      return;
    }
    setSearchParams({ view });
  };

  if (isWizardOpen) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        {error ? <SeasonalNotice>{error}</SeasonalNotice> : null}
        {flow === 'none' ? (
          <div className="connect-page">
            <section className="connect-page__hero">
              <p className="connect-page__kicker">
                {isReconnectState ? 'Reconnect your league' : 'Welcome to Odds Gods'}
              </p>
              <h1 className="connect-page__title">Choose a provider</h1>
            </section>

            <div className="connect-page__providers">
              <button
                className="connect-page__provider connect-page__provider--live"
                onClick={() => setManualFlow('sleeper')}
                type="button"
              >
                <img
                  alt="Sleeper"
                  className="connect-page__provider-logo connect-page__provider-logo--sleeper"
                  src="/providers/sleeper-logo.png"
                />
                <span className="connect-page__provider-action">Connect</span>
              </button>

              <button
                className="connect-page__provider connect-page__provider--live"
                onClick={() => setManualFlow('espn')}
                type="button"
              >
                <img
                  alt="ESPN"
                  className="connect-page__provider-logo connect-page__provider-logo--espn"
                  src="/providers/espn-logo.png"
                />
                <span className="connect-page__provider-action">Connect</span>
              </button>
            </div>

            <p className="connect-page__demo">
              Read-only. We never ask for your password.
            </p>
          </div>
        ) : null}

        {flow === 'sleeper' ? (
          <ConnectWizard
            onConnected={(connection) => {
              connect(connection);
              setManualFlow('none');
              setShowWizard(false);
              navigate('/league', { replace: true });
            }}
          />
        ) : null}

        {flow === 'espn' ? (
          <EspnConnect
            onConnected={(connection) => {
              connect(connection);
              setManualFlow('none');
              setShowWizard(false);
              navigate('/league', { replace: true });
            }}
          />
        ) : null}

        {flow !== 'none' ? (
          <button
            className="connect-page__back"
            onClick={() => {
              if (flowFromHash(location.hash) !== null) {
                navigate('/league#connect', { replace: true });
                return;
              }
              setManualFlow('none');
            }}
            type="button"
          >
            Back to providers
          </button>
        ) : null}
      </div>
    );
  }

  if (stored && isLoading) {
    return (
      <div className="league-page">
        <h1 className="visually-hidden">League market</h1>
        <SeasonalNotice>
          Syncing your league from {PROVIDER_LABEL[stored.provider]}…
        </SeasonalNotice>
      </div>
    );
  }

  const connection = connected?.connection ?? MOCK_LEAGUE;
  const futures = connected?.futures ?? MOCK_LEAGUE_FUTURES;
  const slate = connected?.slate ?? MOCK_WEEK_MATCHUPS;

  return (
    <div className="league-page">
      <h1 className="visually-hidden">League market</h1>

      {!connected ? (
        <SeasonalNotice>
          You&apos;re viewing the demo league.{' '}
          <button
            className="league-page__connect-link"
            onClick={() => {
              setManualFlow('none');
              setShowWizard(true);
            }}
            type="button"
          >
            Connect a league
          </button>{' '}
          to price your real season.
        </SeasonalNotice>
      ) : null}

      {connected && !pricing?.available ? (
        <SeasonalNotice>
          Futures and matchup odds are provisional (scoring history only) until
          projections are imported.
        </SeasonalNotice>
      ) : null}

      {connected && pricing?.available && pricing.scoringNote ? (
        <SeasonalNotice>{pricing.scoringNote}</SeasonalNotice>
      ) : null}

      <div className="league-page__view-tabs" role="tablist" aria-label="League market views">
        {LEAGUE_VIEWS.map((view) => (
          <button
            aria-selected={activeView === view.key}
            className={[
              'league-page__view-tab',
              activeView === view.key ? 'league-page__view-tab--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={view.key}
            onClick={() => setLeagueView(view.key)}
            role="tab"
            type="button"
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === 'this-week' ? (
        <>
          {!connected ? <TradeTargetTeaser groups={MOCK_TRADE_TARGET_GROUPS} /> : null}

          {slate.length > 0 ? (
            <MatchupSlate
              currentWeek={connection.currentWeek}
              history={lineHistory}
              matchups={slate}
            />
          ) : null}
        </>
      ) : null}

      {activeView === 'standings' ? (
        bootstrap && bootstrap.teams.length > 0 ? (
          <>
            <StandingsTable
              teams={bootstrap.teams}
              playoffTeams={bootstrap.league.playoffTeams}
            />
            {connected ? <PlayoffSettings leagueId={bootstrap.league.id} /> : null}
          </>
        ) : (
          <SeasonalNotice>Connect a league to see its standings.</SeasonalNotice>
        )
      ) : null}

      {activeView === 'futures' ? (
        <>
          {connectedSeason ? (
            <SeasonHeadline
              championshipOdds={
                connectedSeason.userFuture?.championOdds ??
                MOCK_SEASON_OUTLOOK.championshipOdds
              }
              leagueRank={connectedSeason.rank}
              live={bootstrap !== null && bootstrap.league.status === 'in_season'}
              playoffProbability={
                connectedSeason.userFuture?.playoffProb ??
                MOCK_SEASON_OUTLOOK.playoffProbability
              }
              recordLabel={connectedSeason.userFuture ? 'Projected wins' : 'Record'}
              recordValue={
                connectedSeason.userFuture?.projWins != null
                  ? `${connectedSeason.userFuture.projWins.toFixed(1)} wins`
                  : connectedSeason.userFuture?.record ?? connectedSeason.record
              }
              title="Your futures"
            />
          ) : (
            <>
              <SeasonHeadline
                championshipOdds={MOCK_SEASON_OUTLOOK.championshipOdds}
                leagueRank={2}
                playoffProbability={MOCK_SEASON_OUTLOOK.playoffProbability}
                recordLabel="Projected record"
                recordRange={MOCK_SEASON_OUTLOOK.recordRange}
                recordValue={`${MOCK_SEASON_OUTLOOK.projectedRecord.wins}-${MOCK_SEASON_OUTLOOK.projectedRecord.losses}`}
                title="Your futures"
              />
              <DraftWrappedCard
                draftWrapped={MOCK_DRAFT_WRAPPED}
                onShare={handleShareDraftWrapped}
              />
            </>
          )}

          <LeagueFutures
            currentWeek={connection.currentWeek}
            futures={futures}
            leagueName={connection.leagueName}
            mode={connected ? 'inseason' : mode}
            playoffTeams={bootstrap?.league.playoffTeams ?? 6}
            scoringFormat={connection.scoringFormat}
            history={lineHistory}
            totalTeams={connection.totalTeams}
          />
        </>
      ) : null}

      {activeView === 'schedule' ? (
        <>
          {connected ? (
            connectedSeason && connectedSeason.scheduleItems.length > 0 ? (
              <ScheduleGrid
                items={connectedScheduleItems}
                onSelectWeek={(item) => setSelectedWeek(item.week)}
                title="Schedule"
              />
            ) : (
              <SeasonalNotice>Loading your schedule…</SeasonalNotice>
            )
          ) : (
            <ScheduleGrid items={preseasonSchedule} title="Upcoming schedule" />
          )}
        </>
      ) : null}

      {selectedWeek && bootstrap && connectedSeason ? (
        <WeekDetailModal
          line={
            pricing?.available
              ? pricing.weeklyLines?.find((line) => line.week === selectedWeek) ?? null
              : null
          }
          onClose={() => setSelectedWeek(null)}
          userTeamName={connectedSeason.userTeam.teamName}
          week={selectedWeek}
        />
      ) : null}
    </div>
  );
}
