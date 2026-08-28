import { Navigate, useParams } from 'react-router-dom';
import { MatchupSlate } from '../components/league/MatchupSlate';
import type { LeagueWeekMatchup } from '../mocks/league';
import type { LineHistoryEntry } from '../services/leagueApi';

type BoardRowVariant = 'collision' | 'truncation' | 'game-of-the-week';

function isVariant(value: string | undefined): value is BoardRowVariant {
  return value === 'collision' || value === 'truncation' || value === 'game-of-the-week';
}

const collisionMatchups: LeagueWeekMatchup[] = [
  {
    matchupId: 801,
    teamARosterId: 1,
    teamA: "Andre's Death Dealers",
    teamAOwnerName: 'AndreVL',
    teamAAvatarUrl: null,
    teamARecord: '7-5',
    teamAOdds: -148,
    teamAWinProb: 58.8,
    teamAProjection: 147.4,
    teamAIsUser: true,
    teamBRosterId: 2,
    teamB: "FantasyGodCasta's Team",
    teamBOwnerName: 'FantasyGodCasta',
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
    teamAOwnerName: 'lukewilliams340',
    teamAAvatarUrl: null,
    teamARecord: '6-6',
    teamAOdds: -118,
    teamAWinProb: 53.1,
    teamAProjection: 144.8,
    teamAIsUser: false,
    teamBRosterId: 4,
    teamB: "FantasyGodCasta's Team",
    teamBOwnerName: 'FantasyGodCasta',
    teamBAvatarUrl: null,
    teamBRecord: '5-7',
    teamBOdds: 102,
    teamBWinProb: 46.9,
    teamBProjection: 142.3,
    teamBIsUser: false,
    isUserGame: false,
  },
];

/**
 * The game of the week ribbon, and the beat before it exists.
 *
 * Three cards: the one the sim crowned, an ordinary one, and one carrying no
 * matchupId at all. That last card is the reason this fixture has three rows
 * rather than two - the ribbon is chosen by comparing ids, and an unidentified
 * card must not match a null answer. Rendered twice, once with the sim's
 * answer and once without it, because the board draws before the conditioned
 * run returns and the second state is what everyone sees first.
 */
const gameOfTheWeekMatchups: LeagueWeekMatchup[] = [
  {
    matchupId: 7101,
    teamARosterId: 5,
    teamA: 'Sonic and Knuckles',
    teamAAvatarUrl: null,
    teamARecord: '7-5',
    teamAOdds: -113,
    teamAWinProb: 53.1,
    teamAProjection: 121.2,
    teamASpread: 2.9,
    teamBRosterId: 6,
    teamB: "Adam's Astounding Team",
    teamBAvatarUrl: null,
    teamBRecord: '7-5',
    teamBOdds: 113,
    teamBWinProb: 46.9,
    teamBProjection: 118.3,
    teamBSpread: -2.9,
    totalProjection: 239.5,
    isUserGame: false,
  },
  {
    matchupId: 7102,
    teamARosterId: 7,
    teamA: 'Zeus\u2019s Bolts',
    teamAAvatarUrl: null,
    teamARecord: '9-3',
    teamAOdds: -186,
    teamAWinProb: 65.0,
    teamAProjection: 134.9,
    teamASpread: 9.4,
    teamAIsUser: true,
    teamBRosterId: 8,
    teamB: 'Waiver Wire Warriors',
    teamBAvatarUrl: null,
    teamBRecord: '3-9',
    teamBOdds: 156,
    teamBWinProb: 35.0,
    teamBProjection: 125.5,
    teamBSpread: -9.4,
    totalProjection: 260.4,
    isUserGame: true,
  },
  {
    /* No matchupId: the provider has a game here but nothing to key it by. */
    teamARosterId: 9,
    teamA: 'The Unidentified',
    teamAAvatarUrl: null,
    teamARecord: '6-6',
    teamAOdds: -104,
    teamAWinProb: 51.0,
    teamAProjection: 119.0,
    teamBRosterId: 10,
    teamB: 'Nameless Nine',
    teamBAvatarUrl: null,
    teamBRecord: '6-6',
    teamBOdds: 104,
    teamBWinProb: 49.0,
    teamBProjection: 118.0,
    isUserGame: false,
  },
];

export function DesignBoardRowPage() {
  const { variant } = useParams<{ variant?: string }>();

  if (!isVariant(variant)) {
    return <Navigate replace to="/design/board-row/collision" />;
  }

  const matchups =
    variant === 'collision'
      ? collisionMatchups
      : variant === 'truncation'
        ? truncationMatchups
        : gameOfTheWeekMatchups;
  const history = variant === 'collision' ? collisionHistory : null;

  return (
    <div
      style={{
        width: 'min(100%, 1320px)',
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
      {variant === 'game-of-the-week' ? (
        <>
          <MatchupSlate currentWeek={8} gameOfTheWeek={7101} matchups={matchups} />
          {/* The same board a moment earlier, while the conditioned run is
              still going. No ribbon anywhere, including on the card that has
              no id of its own to be matched by. */}
          <MatchupSlate currentWeek={8} gameOfTheWeek={null} matchups={matchups} />
        </>
      ) : (
        <MatchupSlate currentWeek={8} history={history} matchups={matchups} />
      )}
    </div>
  );
}
