import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ConnectWizard } from '../components/league/ConnectWizard';
import { EspnConnect } from '../components/league/EspnConnect';
import { LeagueFutures } from '../components/league/LeagueFutures';
import { MatchupSlate } from '../components/league/MatchupSlate';
import { PlayoffSettings } from '../components/league/PlayoffSettings';
import { StandingsTable } from '../components/league/StandingsTable';
import { LuckBoard, type LuckBoardTeam } from '../components/league/LuckBoard';
import { computeAllPlay } from '../utils/allPlay';
import { formatVsBook, vsBookRecords } from '../utils/vsBook';
import { buildTicket } from '../utils/ticket';
import { YourTicket } from '../components/league/YourTicket';
import { TimeMachine } from '../components/league/TimeMachine';
import { LeagueRecords } from '../components/league/LeagueRecords';
import { Predictor, type PredictorGame, type PredictorBaselineRow } from '../components/league/Predictor';
import { WeekFork } from '../components/league/WeekFork';
import { forkRows } from '../utils/forkRows';
import {
  fetchWeekForks,
  fetchProjectedScores,
  type WeekForksResult,
  type ProjectedScores,
} from '../services/predictor';
import { leagueRecords } from '../utils/leagueRecords';
import { TradeTargetTeaser } from '../components/league/TradeTargetTeaser';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { ScheduleGrid, type ScheduleGridItem } from '../components/season/ScheduleGrid';
import { SeasonHeadline } from '../components/season/SeasonHeadline';
import { WeekDetailModal } from '../components/season/WeekDetailModal';
import { useAuth } from '../contexts/AuthContext';
import { ProviderMark } from '../components/league/ProviderMark';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useSeasonMode } from '../hooks/useSeasonMode';
import { isAgreementAdmin } from '../utils/admin';
import {
  getUserTeam,
  toLeagueConnection,
  toLeagueFutures,
  toScheduleItems,
  toWeekMatchups,
} from '../adapters/connectedLeague';
import {
  MOCK_LEAGUE,
  MOCK_LEAGUE_FUTURES,
  MOCK_SCHEDULE_PREVIEW,
  MOCK_SEASON_OUTLOOK,
  MOCK_TRADE_TARGET_GROUPS,
  MOCK_WEEK_MATCHUPS,
} from '../mocks';
import { PROVIDER_LABEL } from '../utils/provider';
import './ConnectPage.css';
import './LeaguePage.css';
import { PreDraftHub } from '../components/matchup/PreDraftHub';
import { isLeaguePreDraft } from '../utils/preDraft';
import { officialLeagueUrl } from '../utils/officialLeagueUrl';

type ConnectFlow = 'none' | 'sleeper' | 'espn';
type LeagueView = 'this-week' | 'futures' | 'season' | 'predictor' | 'standings';

/**
 * Three tabs, not five.
 *
 * "This week", "Schedule" and "All-play" were three destinations answering one
 * question each, and two of them were about the same span of time: All-play is
 * a verdict on the weeks you have played, Schedule is the same weeks plus the
 * ones to come. Splitting them meant the schedule strip and the record it
 * produced could not be read against each other, which is the only way either
 * is interesting.
 *
 * "This week", not "Board": the site already has a Board in the primary nav,
 * and two things called the same word one row apart is a navigation bug
 * wearing a label.
 *
 * Each tab owns a direction in time. This week is now. Futures is ahead.
 * Season is behind. A tab that cannot say which of the three it is does not
 * have a reason to exist.
 *
 * Standings is gone from the strip entirely. It was never a user surface —
 * wins, PF and PA are already on ESPN and Sleeper, rendered better and without
 * our sync lag — and its real job is as a check on the sim, which is a thing
 * you reach for deliberately. The route still answers for anyone who types it.
 */
const LEAGUE_VIEWS: Array<{ key: LeagueView; label: string }> = [
  { key: 'this-week', label: 'This week' },
  { key: 'futures', label: 'Futures' },
  { key: 'season', label: 'Season' },
  { key: 'predictor', label: 'Predictor' },
];

/* Reachable by URL, never in the strip. */
const ADMIN_LEAGUE_VIEWS: Array<{ key: LeagueView; label: string }> = [
  { key: 'standings', label: 'Standings' },
];

/**
 * Old URLs keep working.
 *
 * These view names shipped and are in people's history and bookmarks; a
 * renamed tab that answers with the default view is a link that silently lies
 * about where it went.
 */
const LEGACY_VIEWS: Record<string, LeagueView> = {
  board: 'this-week',
  schedule: 'season',
  luck: 'season',
};

function flowFromHash(hash: string): ConnectFlow | null {
  if (hash === '#connect-sleeper') return 'sleeper';
  if (hash === '#connect-espn') return 'espn';
  return null;
}

/**
 * Read a view out of the URL. Every known view, admin ones included.
 *
 * This used to check LEAGUE_VIEWS alone, which does not contain 'standings'.
 * So an admin clicking the Standings tab set ?view=standings, this coerced it
 * straight back to 'this-week', and the tab rendered but never activated: a
 * visible control that did nothing when clicked. Deciding who may see a view
 * is not this function's job — activeView below is the gate, and doing it in
 * two places is what made them disagree.
 */
const ALL_LEAGUE_VIEWS = [...LEAGUE_VIEWS, ...ADMIN_LEAGUE_VIEWS];

function parseLeagueView(raw: string | null): LeagueView {
  if (raw && raw in LEGACY_VIEWS) return LEGACY_VIEWS[raw];
  return ALL_LEAGUE_VIEWS.some((view) => view.key === raw)
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
  const { user } = useAuth();
  const isAdmin = isAgreementAdmin(user?.email);
  const requestedView = parseLeagueView(searchParams.get('view'));
  /* A hidden tab still has a URL. Without this, ?view=standings rendered the
     table for anyone who typed it or kept an old bookmark, which would make
     the gate decorative. */
  const isReconnectState = Boolean(stored && !bootstrap && !isLoading && error);
  const hasConnectHash = location.hash.startsWith('#connect');
  const isWizardOpen = showWizard || hasConnectHash || isReconnectState;
  const flow =
    flowFromHash(location.hash) ??
    (showWizard || hasConnectHash || isReconnectState ? manualFlow : 'none');

  /* The same gate the Hub has. Before a draft this page is a board of twelve
     0-0 teams all priced at +100 and a "Week 2 matchups" header for a week
     nobody has played — the numbers are real arithmetic on nothing. */
  const preDraft = bootstrap != null && isLeaguePreDraft(bootstrap);

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

  /* All-play needs only what has already happened: each team's score in each
     completed week, plus their real record over those same weeks. Both are on
     data the page already holds, so this adds no request and asks the engine
     for nothing — it predicts nothing to ask about. */
  const luckTeams = useMemo<LuckBoardTeam[]>(() => {
    if (!bootstrap || !schedule) return [];
    const scores = schedule.flatMap((weekEntry) =>
      weekEntry.matchups.map((matchup) => ({
        week: weekEntry.week,
        rosterId: matchup.rosterId,
        points: matchup.points ?? 0,
      })),
    );
    const headToHead = new Map(
      bootstrap.teams.map((team) => [team.rosterId, team.record.wins]),
    );
    const byRoster = new Map(bootstrap.teams.map((team) => [team.rosterId, team]));

    /* Graded against the closing spread we actually posted. Needs the final
       score AND the stored line, so it only covers weeks that have both. */
    const matchupByWeekRoster = new Map<string, number>();
    const opponentPoints = new Map<string, number>();
    for (const weekEntry of schedule) {
      const byMatchup = new Map<number, typeof weekEntry.matchups>();
      for (const matchup of weekEntry.matchups) {
        byMatchup.set(matchup.matchupId, [...(byMatchup.get(matchup.matchupId) ?? []), matchup]);
      }
      for (const [matchupId, pair] of byMatchup) {
        if (pair.length !== 2) continue;
        for (const [index, side] of pair.entries()) {
          const key = `${weekEntry.week}:${side.rosterId}`;
          matchupByWeekRoster.set(key, matchupId);
          opponentPoints.set(key, pair[1 - index].points ?? 0);
        }
      }
    }

    const gradedResults = scores
      .filter((score) => score.points > 0)
      .map((score) => ({
        week: score.week,
        rosterId: String(score.rosterId),
        points: score.points,
        opponentPoints: opponentPoints.get(`${score.week}:${score.rosterId}`) ?? 0,
      }))
      .filter((result) => result.opponentPoints > 0);

    const vsBookByRoster = new Map(
      vsBookRecords(lineHistory ?? [], gradedResults, (week, rosterId) =>
        matchupByWeekRoster.get(`${week}:${rosterId}`) ?? null,
      ).map((record) => [record.rosterId, record]),
    );

    return computeAllPlay(scores, headToHead)
      .map((row) => {
        const team = byRoster.get(row.rosterId);
        if (!team) return null;
        return {
          ...row,
          teamName: team.teamName,
          ownerName: team.ownerName,
          isUser: team.isUser,
          record: team.record,
          vsBook: formatVsBook(vsBookByRoster.get(String(row.rosterId))),
        };
      })
      .filter((row): row is LuckBoardTeam => row != null);
  }, [bootstrap, schedule, lineHistory]);

  /* The user's own season position, marked from the opening book. Null
     whenever there is nothing honest to quote, which the component treats as
     "do not render" rather than as an empty state to fill. */
  const ticket = useMemo(
    () => buildTicket(lineHistory ?? [], connectedSeason?.userTeam.rosterId ?? null),
    [lineHistory, connectedSeason],
  );

  /* Season is retrospective, so before a draft it is a page about a season
     that has not happened: an empty all-play table, an empty record book and a
     schedule of unplayed weeks. Hidden until there is something behind it. */
  const seasonHasContent = !preDraft && luckTeams.some((team) => team.weeksCounted > 0);
  const visibleViews = LEAGUE_VIEWS.filter(
    (view) => view.key !== 'season' || seasonHasContent,
  );
  /* Admins can still reach the standings diagnostic by URL; it is not a tab. */
  const reachableViews = isAdmin ? [...visibleViews, ...ADMIN_LEAGUE_VIEWS] : visibleViews;

  const activeView =
    reachableViews.some((view) => view.key === requestedView) ? requestedView : 'this-week';

  /* The record book, over every completed game we have priced. Empty holders
     are expected early and are rendered as such rather than hidden. */
  const records = useMemo(() => {
    if (!bootstrap || !schedule) return [];
    const games = schedule.flatMap((weekEntry) => {
      const byMatchup = new Map<number, typeof weekEntry.matchups>();
      for (const matchup of weekEntry.matchups) {
        byMatchup.set(matchup.matchupId, [...(byMatchup.get(matchup.matchupId) ?? []), matchup]);
      }
      return [...byMatchup.entries()].flatMap(([matchupId, pair]) => {
        if (pair.length !== 2) return [];
        if (!pair.every((side) => (side.points ?? 0) > 0)) return [];
        return pair.map((side, index) => ({
          week: weekEntry.week,
          matchupId,
          rosterId: String(side.rosterId),
          opponentRosterId: String(pair[1 - index].rosterId),
          points: side.points ?? 0,
          opponentPoints: pair[1 - index].points ?? 0,
        }));
      });
    });
    return leagueRecords(lineHistory ?? [], games, (rosterId) =>
      bootstrap.teams.find((team) => String(team.rosterId) === rosterId)?.teamName ?? null,
    );
  }, [bootstrap, schedule, lineHistory]);

  /* Both branches of every game this week. Reads the contract in
     services/predictor.ts; until that endpoint exists the component is told
     why rather than shown invented branches. */
  const [forks, setForks] = useState<WeekForksResult | null>(null);
  useEffect(() => {
    if (!stored || !bootstrap) return undefined;
    let cancelled = false;
    void fetchWeekForks(String(stored.leagueId), String(stored.userId), bootstrap.week)
      .then((result) => {
        if (!cancelled) setForks(result);
      });
    return () => {
      cancelled = true;
    };
  }, [stored, bootstrap]);

  /* Each team's projected points per remaining week — shown on the Predictor's
     matchups and used as the override-box default. Cheap (no sims) and cached. */
  const [projScores, setProjScores] = useState<ProjectedScores | null>(null);
  useEffect(() => {
    if (!stored || !bootstrap) return undefined;
    let cancelled = false;
    void fetchProjectedScores(String(stored.leagueId), String(stored.userId))
      .then((result) => {
        if (!cancelled) setProjScores(result);
      });
    return () => {
      cancelled = true;
    };
  }, [stored, bootstrap]);

  const projByWeekRoster = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of projScores?.weeks ?? []) {
      for (const [rosterId, points] of Object.entries(entry.scores)) {
        map.set(`${entry.week}:${rosterId}`, points);
      }
    }
    return map;
  }, [projScores]);

  /* Remaining games, and the board as it stands with nothing forced. Both are
     read off data the page already holds; the conditioned numbers come from
     the engine, not from here. */
  const predictorGames = useMemo<PredictorGame[]>(() => {
    if (!bootstrap || !schedule) return [];
    return schedule.flatMap((weekEntry) => {
      if (weekEntry.week < bootstrap.week) return [];
      const byMatchup = new Map<number, typeof weekEntry.matchups>();
      for (const matchup of weekEntry.matchups) {
        byMatchup.set(matchup.matchupId, [...(byMatchup.get(matchup.matchupId) ?? []), matchup]);
      }
      return [...byMatchup.entries()].flatMap(([matchupId, pair]) => {
        if (pair.length !== 2) return [];
        const named = pair.map((side) => {
          const team = bootstrap.teams.find(
            (candidate) => String(candidate.rosterId) === String(side.rosterId),
          );
          return {
            rosterId: String(side.rosterId),
            teamName: team?.teamName ?? '',
            avatarUrl: team?.avatarUrl ?? null,
            projPoints: projByWeekRoster.get(`${weekEntry.week}:${String(side.rosterId)}`),
          };
        });
        if (named.some((side) => !side.teamName)) return [];
        return [{ week: weekEntry.week, matchupId, away: named[0], home: named[1] }];
      });
    });
  }, [bootstrap, schedule, projByWeekRoster]);

  const predictorBaseline = useMemo<PredictorBaselineRow[]>(() => {
    if (!connected) return [];
    /* Current record + PF for the baseline columns; the conditioned response
       carries its own (base + forced picks). Keyed off the bootstrap teams,
       which carry both. */
    const teamByRoster = new Map(
      (bootstrap?.teams ?? []).map((team) => [String(team.rosterId), team]),
    );
    return connected.futures.map((row) => {
      const rid = String(row.rosterId ?? '');
      const team = teamByRoster.get(rid);
      return {
        rosterId: rid,
        teamName: row.teamName,
        avatarUrl: row.avatarUrl ?? null,
        isUser: Boolean(row.isUser),
        playoffProb: row.playoffProb ?? 0,
        playoffOdds: row.playoffOdds,
        /* The futures row carries the price, not the raw probability; the
           Predictor only needs the price for the baseline column. */
        titleProb: 0,
        titleOdds: row.championOdds,
        record: team?.record ?? { wins: 0, losses: 0, ties: 0 },
        pointsFor: team?.pointsFor ?? null,
      };
    });
  }, [connected, bootstrap]);

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

  const setLeagueView = (view: LeagueView) => {
    /* The default view owns the bare URL, so /league and /league?view=board are
       the same page rather than two. */
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
                <ProviderMark className="connect-page__provider-logo connect-page__provider-logo--sleeper" provider="sleeper" />
                <span className="connect-page__provider-action">Connect</span>
              </button>

              <button
                className="connect-page__provider connect-page__provider--live"
                onClick={() => setManualFlow('espn')}
                type="button"
              >
                <ProviderMark className="connect-page__provider-logo connect-page__provider-logo--espn" provider="espn" />
                <span className="connect-page__provider-action">Connect</span>
              </button>
            </div>

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

  if (stored && bootstrap && preDraft) {
    return (
      <PreDraftHub
        bootstrap={bootstrap}
        officialUrl={officialLeagueUrl(stored)}
        provider={stored.provider}
        scope="league"
      />
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
        {visibleViews.map((view) => (
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

      {activeView === 'this-week' && bootstrap ? (
        <WeekFork
          rows={forkRows(
            forks?.forks ?? [],
            (rosterId) =>
              bootstrap.teams.find((team) => String(team.rosterId) === rosterId)?.teamName ?? null,
            connectedSeason ? String(connectedSeason.userTeam.rosterId) : null,
          )}
          unavailableMessage={forks && !forks.available ? forks.message : undefined}
          week={forks?.week ?? bootstrap.week}
        />
      ) : null}

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
              /* No mock fallback for a real league. An unpriced team says so. */
              championshipOdds={connectedSeason.userFuture?.championOdds ?? null}
              leagueRank={connectedSeason.rank}
              live={bootstrap !== null && bootstrap.league.status === 'in_season'}
              playoffProbability={connectedSeason.userFuture?.playoffProb ?? null}
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

      {/* Season, stacked in the order the story is told: what happened to you
          week by week, then the verdict that reading produces. They used to be
          two tabs, which meant the strip and the record it explains could never
          be read against each other. */}
      {activeView === 'futures' && ticket && connectedSeason && bootstrap ? (
        <YourTicket
          leagueName={bootstrap.league.name}
          teamName={connectedSeason.userTeam.teamName}
          ticket={ticket}
        />
      ) : null}

      {activeView === 'predictor' ? (
        <>
          {connected && bootstrap ? (
            <Predictor
              baseline={predictorBaseline}
              games={predictorGames}
              leagueId={String(stored?.leagueId ?? '')}
              storageKey={`og.predictor.${stored?.provider}.${stored?.leagueId}`}
              userId={String(stored?.userId ?? '')}
            />
          ) : (
            <SeasonalNotice>Connect a league to call the rest of its season.</SeasonalNotice>
          )}
        </>
      ) : null}

      {activeView === 'season' ? (
        <>
          {connected ? (
            <>
              {/* Verdict first. The schedule used to open this page as
                  seventeen tall, near-empty rows, so the finding the page
                  exists to deliver was below the fold behind a list. */}
              <LuckBoard teams={luckTeams} />
              {connectedSeason && connectedSeason.scheduleItems.length > 0 ? (
                <ScheduleGrid
                  items={connectedScheduleItems}
                  onSelectWeek={(item) => setSelectedWeek(item.week)}
                  title="Your season, week by week"
                />
              ) : (
                <SeasonalNotice>Loading your schedule…</SeasonalNotice>
              )}
              <LeagueRecords records={records} />
              {/* Retrospective, so it belongs with the past rather than above
                  the forward-looking market. Having it lead Futures is a large
                  part of why Season and Futures read as the same tab. */}
              {bootstrap ? (
                <TimeMachine
                  history={lineHistory}
                  nameFor={(rosterId) =>
                    bootstrap.teams.find((team) => String(team.rosterId) === rosterId)?.teamName ?? null
                  }
                  teamName={connectedSeason?.userTeam.teamName ?? ''}
                  userRosterId={connectedSeason?.userTeam.rosterId}
                />
              ) : null}
            </>
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
