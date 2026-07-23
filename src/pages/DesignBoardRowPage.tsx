import { Navigate, useParams } from 'react-router-dom';
import { MatchupSlate } from '../components/league/MatchupSlate';
import type { LeagueWeekMatchup } from '../mocks/league';
import type { LineHistoryEntry } from '../services/leagueApi';

type BoardRowVariant = 'collision' | 'truncation';

function isVariant(value: string | undefined): value is BoardRowVariant {
  return value === 'collision' || value === 'truncation';
}

const collisionMatchups: LeagueWeekMatchup[] = [
  {
    matchupId: 801,
    teamARosterId: 1,
    teamA: "Andre's Death Dealers",
    teamAAvatarUrl: null,
    teamARecord: '7-5',
    teamAOdds: -148,
    teamAWinProb: 58.8,
    teamAProjection: 147.4,
    teamAIsUser: true,
    teamBRosterId: 2,
    teamB: 'Poseidon Waves',
    teamBAvatarUrl: null,
    teamBRecord: '8-4',
    teamBOdds: 126,
    teamBWinProb: 41.2,
    teamBProjection: 141.2,
    teamBIsUser: false,
    isUserGame: true,
  },
];

const collisionHistory: LineHistoryEntry[] = [
  {
    computedAt: new Date('2026-07-23T09:00:00-04:00').getTime(),
    inputsHash: 'board-row-collision-open',
    projectionVersion: 'board-row-stress-v1',
    week: 8,
    trigger: 'opening board',
    lines: [
      {
        matchupId: 801,
        sides: {
          '1': { moneyline: -110, winProbability: 55.2 },
          '2': { moneyline: -102, winProbability: 44.8 },
        },
      },
    ],
  },
  {
    computedAt: new Date('2026-07-23T11:42:00-04:00').getTime(),
    inputsHash: 'board-row-collision-latest',
    projectionVersion: 'board-row-stress-v1',
    week: 8,
    trigger: 'latest board',
    lines: [
      {
        matchupId: 801,
        sides: {
          '1': { moneyline: -148, winProbability: 58.8 },
          '2': { moneyline: 126, winProbability: 41.2 },
        },
      },
    ],
  },
];

const truncationMatchups: LeagueWeekMatchup[] = [
  {
    matchupId: 9902,
    teamARosterId: 3,
    teamA: "lukewilliams340's Team",
    teamAAvatarUrl: null,
    teamARecord: '6-6',
    teamAOdds: -118,
    teamAWinProb: 53.1,
    teamAProjection: 144.8,
    teamAIsUser: false,
    teamBRosterId: 4,
    teamB: "FantasyGodCasta's Team",
    teamBAvatarUrl: null,
    teamBRecord: '5-7',
    teamBOdds: 102,
    teamBWinProb: 46.9,
    teamBProjection: 142.3,
    teamBIsUser: false,
    isUserGame: false,
  },
];

export function DesignBoardRowPage() {
  const { variant } = useParams<{ variant?: string }>();

  if (!isVariant(variant)) {
    return <Navigate replace to="/design/board-row/collision" />;
  }

  const matchups = variant === 'collision' ? collisionMatchups : truncationMatchups;
  const history = variant === 'collision' ? collisionHistory : null;

  return (
    <div
      style={{
        width: 'min(100%, 1120px)',
        margin: '0 auto',
        padding: '24px 16px 80px',
        display: 'grid',
        gap: '16px',
      }}
    >
      <div
        style={{
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
          padding: '16px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-ui)',
          fontSize: '13px',
        }}
      >
        Design board-row stress fixture: {variant}
      </div>
      <MatchupSlate currentWeek={8} history={history} matchups={matchups} />
    </div>
  );
}
