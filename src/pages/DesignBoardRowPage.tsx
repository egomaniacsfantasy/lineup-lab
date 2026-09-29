import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { BetSlip } from '../components/league/BetSlip';
import { toggleLeg, removeLeg, type ParlayLeg } from '../utils/parlay';
import { MatchupSlate } from '../components/league/MatchupSlate';
import type { LeagueWeekMatchup } from '../mocks/league';
import type { LineupSlotEntry } from '../utils/matchupLineups';
import type { LineHistoryEntry } from '../services/leagueApi';

type BoardRowVariant = 'collision' | 'truncation' | 'game-of-the-week' | 'slip' | 'detail' | 'kickoff';

function isVariant(value: string | undefined): value is BoardRowVariant {
  return (
    value === 'collision' ||
    value === 'truncation' ||
    value === 'game-of-the-week' ||
    value === 'slip' ||
    value === 'detail' ||
    value === 'kickoff'
  );
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

/* Conditioned branches for the slip scene, so the detail rail's swing panel
   is designable and testable without a connected league behind it. Shaped
   exactly as forkPairs returns them. */
const DESIGN_FORKS = [
  {
    matchupId: 7101,
    importance: 100,
    sides: [
      {
        rosterId: '5',
        teamName: 'Sonic and Knuckles',
        avatarUrl: null,
        isUser: false,
        nowProb: 63.1,
        winProb: 78.4,
        lossProb: 44.2,
      },
      {
        rosterId: '6',
        teamName: 'Adam\u2019s Astounding Team',
        avatarUrl: null,
        isUser: false,
        nowProb: 55.4,
        winProb: 71.0,
        lossProb: 38.6,
      },
    ] as const,
  },
  {
    matchupId: 7102,
    importance: 62,
    sides: [
      {
        rosterId: '7',
        teamName: 'Zeus\u2019s Bolts',
        avatarUrl: null,
        isUser: true,
        nowProb: 81.2,
        winProb: 90.5,
        lossProb: 68.0,
      },
      {
        rosterId: '8',
        teamName: 'Waiver Wire Warriors',
        avatarUrl: null,
        isUser: false,
        nowProb: 12.4,
        winProb: 22.9,
        lossProb: 5.1,
      },
    ] as const,
  },
] as unknown as import('../components/league/WeekFork').ForkPair[];

/* Two full lineups for the detail panel, with the cases that break it: an
   empty slot, a starter nobody priced, and a player carrying an injury tag.
   Names are long enough on one side to test the truncation the columns
   promise. */
const detailLeftStarters: LineupSlotEntry[] = [
  { slot: 'QB', playerId: 'p1', name: 'Jalen Hurts', position: 'QB', team: 'PHI', injuryStatus: null, projection: 22.4 },
  { slot: 'RB', playerId: 'p2', name: 'Bijan Robinson', position: 'RB', team: 'ATL', injuryStatus: null, projection: 18.1 },
  { slot: 'RB', playerId: 'p3', name: 'Kenneth Walker III', position: 'RB', team: 'SEA', injuryStatus: 'Questionable', projection: 12.6 },
  { slot: 'WR', playerId: 'p4', name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET', injuryStatus: null, projection: 17.9 },
  { slot: 'WR', playerId: 'p5', name: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI', injuryStatus: null, projection: 14.2 },
  { slot: 'TE', playerId: 'p6', name: 'Trey McBride', position: 'TE', team: 'ARI', injuryStatus: null, projection: 11.8 },
  { slot: 'FLEX', playerId: 'p7', name: 'Jaxon Smith-Njigba', position: 'WR', team: 'SEA', injuryStatus: null, projection: 13.0 },
  { slot: 'K', playerId: 'p8', name: 'Brandon Aubrey', position: 'K', team: 'DAL', injuryStatus: null, projection: 9.4 },
  { slot: 'DEF', playerId: 'p9', name: 'Baltimore Ravens', position: 'DEF', team: 'BAL', injuryStatus: null, projection: 8.0 },
];

const detailRightStarters: LineupSlotEntry[] = [
  { slot: 'QB', playerId: 'q1', name: 'Josh Allen', position: 'QB', team: 'BUF', injuryStatus: null, projection: 23.7 },
  { slot: 'RB', playerId: 'q2', name: 'Saquon Barkley', position: 'RB', team: 'PHI', injuryStatus: null, projection: 19.5 },
  /* Nobody priced this one. The cell has to say so rather than print a zero
     that reads as a projection of nothing. */
  { slot: 'RB', playerId: 'q3', name: 'Tyrone Tracy Jr.', position: 'RB', team: 'NYG', injuryStatus: null, projection: null },
  { slot: 'WR', playerId: 'q4', name: 'Ja\u2019Marr Chase', position: 'WR', team: 'CIN', injuryStatus: null, projection: 20.3 },
  { slot: 'WR', playerId: 'q5', name: 'Nico Collins', position: 'WR', team: 'HOU', injuryStatus: 'Out', projection: 0 },
  { slot: 'TE', playerId: 'q6', name: 'Brock Bowers', position: 'TE', team: 'LV', injuryStatus: null, projection: 13.4 },
  /* An empty starting slot, which is a lineup nobody finished setting. */
  { slot: 'FLEX', playerId: null, name: 'Empty', position: null, team: null, injuryStatus: null, projection: null },
  { slot: 'K', playerId: 'q8', name: 'Chris Boswell', position: 'K', team: 'PIT', injuryStatus: null, projection: 8.8 },
  { slot: 'DEF', playerId: 'q9', name: 'Denver Broncos', position: 'DEF', team: 'DEN', injuryStatus: null, projection: 7.6 },
];

const detailMatchups: LeagueWeekMatchup[] = [
  {
    matchupId: 901,
    teamARosterId: 1,
    teamA: "Andre's Death Dealers",
    teamAOwnerName: 'AndreVL',
    teamAAvatarUrl: null,
    teamARecord: '7-5',
    teamAOdds: 118,
    teamAWinProb: 45.9,
    teamAProjection: 127.4,
    teamASpread: -4.5,
    teamAIsUser: true,
    teamAStarters: detailLeftStarters,
    teamBRosterId: 2,
    teamB: 'Gridiron Heretics',
    teamBOwnerName: 'FantasyGodCasta',
    teamBAvatarUrl: null,
    teamBRecord: '9-3',
    teamBOdds: -142,
    teamBWinProb: 54.1,
    teamBProjection: 131.9,
    teamBSpread: 4.5,
    teamBIsUser: false,
    teamBStarters: detailRightStarters,
    totalProjection: 259.3,
    isUserGame: true,
  },
  {
    matchupId: 902,
    teamARosterId: 3,
    teamA: 'Sunday Scaries',
    teamAOwnerName: 'mmoser',
    teamAAvatarUrl: null,
    teamARecord: '6-6',
    teamAOdds: 142,
    teamAWinProb: 37.3,
    teamAProjection: 127.7,
    teamASpread: -7.1,
    teamAIsUser: false,
    teamAStarters: detailRightStarters,
    teamBRosterId: 4,
    teamB: 'Waiver Wire Wizards',
    teamBOwnerName: 'jdoe',
    teamBAvatarUrl: null,
    teamBRecord: '5-7',
    teamBOdds: -168,
    teamBWinProb: 62.7,
    teamBProjection: 134.8,
    teamBSpread: 7.1,
    teamBIsUser: false,
    teamBStarters: detailLeftStarters,
    totalProjection: 262.5,
    isUserGame: false,
  },
];

/**
 * Monday night, midway through the late game.
 *
 * The board as it was reported: three games that started on Sunday and one
 * that has not. Read off the live board, the glance crowned a team that had
 * already won (a check where a price goes), called a -313 game the closest
 * line, took its total from Sunday's scoring and its biggest move from one
 * team's afternoon. The history is what the server stores: an open, a close
 * two hours before the Sunday kickoffs, and two snapshots after them with
 * Sunday's scores pinned in.
 *
 * Kickoffs are fixed dates on either side of any real clock the fixture is
 * opened on, so which games have started does not depend on when it is run.
 * Drawn twice: with the Monday game still to play, and once it has kicked off.
 */
const KICKOFF_SUNDAY = '2026-09-27T17:00:00Z';
const KICKOFF_MONDAY = '2026-09-29T00:15:00Z';
const KICKOFF_NOT_YET = '2099-01-06T01:15:00Z';

function kickoffStarter(id: string, team: string, projection: number): LineupSlotEntry {
  return { slot: 'FLEX', playerId: id, name: `${team} starter`, position: 'WR', team, injuryStatus: null, projection };
}

const kickoffMatchups: LeagueWeekMatchup[] = [
  {
    matchupId: 7301,
    teamARosterId: 5,
    teamA: 'Sonic and Knuckles',
    teamAAvatarUrl: null,
    teamARecord: '2-1',
    /* Decided: the price has gone past the board. */
    teamAOdds: -999_900,
    teamAWinProb: 100,
    teamAProjection: 151.0,
    teamASpread: 50.3,
    teamAStarters: [kickoffStarter('k1', 'KC', 18.2), kickoffStarter('k2', 'BUF', 16.4)],
    teamBRosterId: 6,
    teamB: "Adam's Astounding Team",
    teamBAvatarUrl: null,
    teamBRecord: '1-2',
    teamBOdds: 999_900,
    teamBWinProb: 0,
    teamBProjection: 100.7,
    teamBSpread: -50.3,
    teamBStarters: [kickoffStarter('k3', 'PHI', 15.1), kickoffStarter('k4', 'DAL', 12.9)],
    totalProjection: 251.7,
    isUserGame: false,
  },
  {
    matchupId: 7302,
    teamARosterId: 7,
    teamA: 'Zeus’s Bolts',
    teamAAvatarUrl: null,
    teamARecord: '3-0',
    teamAOdds: -313,
    teamAWinProb: 75.8,
    teamAProjection: 139.9,
    teamASpread: 21.5,
    teamAStarters: [kickoffStarter('k5', 'SF', 17.0), kickoffStarter('k6', 'LAR', 14.2)],
    teamBRosterId: 8,
    teamB: 'Waiver Wire Warriors',
    teamBAvatarUrl: null,
    teamBRecord: '0-3',
    teamBOdds: 313,
    teamBWinProb: 24.2,
    teamBProjection: 118.4,
    teamBSpread: -21.5,
    teamBStarters: [kickoffStarter('k7', 'SEA', 13.8), kickoffStarter('k8', 'ARI', 11.6)],
    totalProjection: 262.0,
    isUserGame: false,
  },
  {
    matchupId: 7303,
    teamARosterId: 9,
    teamA: 'Gridiron Heretics',
    teamAAvatarUrl: null,
    teamARecord: '2-1',
    teamAOdds: -733,
    teamAWinProb: 88.0,
    teamAProjection: 148.8,
    teamASpread: 29.1,
    teamAStarters: [kickoffStarter('k9', 'DET', 16.6), kickoffStarter('k10', 'GB', 14.0)],
    teamBRosterId: 10,
    teamB: 'Sunday Scaries',
    teamBAvatarUrl: null,
    teamBRecord: '1-2',
    teamBOdds: 733,
    teamBWinProb: 12.0,
    teamBProjection: 119.7,
    teamBSpread: -29.1,
    teamBStarters: [kickoffStarter('k11', 'MIN', 15.3), kickoffStarter('k12', 'CHI', 10.9)],
    /* Sunday's scoring, not a total anybody posted. */
    totalProjection: 268.5,
    isUserGame: false,
  },
  {
    matchupId: 7304,
    teamARosterId: 11,
    teamA: 'Mount Olympians',
    teamAAvatarUrl: null,
    teamARecord: '2-1',
    teamAOdds: -251,
    teamAWinProb: 71.5,
    teamAProjection: 128.0,
    teamASpread: 10.0,
    teamAStarters: [kickoffStarter('k13', 'NYJ', 15.7), kickoffStarter('k14', 'MIA', 14.8)],
    teamBRosterId: 12,
    teamB: 'Underworld United',
    teamBAvatarUrl: null,
    teamBRecord: '1-2',
    teamBOdds: 251,
    teamBWinProb: 28.5,
    teamBProjection: 118.0,
    teamBSpread: -10.0,
    teamBStarters: [kickoffStarter('k15', 'NE', 13.4), kickoffStarter('k16', 'PIT', 12.2)],
    totalProjection: 246.0,
    isUserGame: false,
  },
];

function kickoffSides(
  a: number,
  b: number,
  aProb: number,
  aMoneyline: number,
  aProjection: number,
  bProjection: number,
) {
  return {
    [String(a)]: { moneyline: aMoneyline, winProbability: aProb, projection: aProjection },
    [String(b)]: {
      moneyline: -aMoneyline,
      winProbability: Number((100 - aProb).toFixed(1)),
      projection: bProjection,
    },
  };
}

function kickoffSnapshot(at: string, trigger: string, lines: LineHistoryEntry['lines']): LineHistoryEntry {
  return {
    computedAt: Date.parse(at),
    inputsHash: `kickoff-${trigger}`,
    projectionVersion: 'kickoff-v1',
    week: 8,
    trigger,
    lines,
  };
}

const kickoffHistory: LineHistoryEntry[] = [
  kickoffSnapshot('2026-09-22T14:00:00Z', 'weekly roll', [
    { matchupId: 7301, sides: kickoffSides(5, 6, 58.0, -138, 128.0, 120.0) },
    { matchupId: 7302, sides: kickoffSides(7, 8, 55.0, -122, 130.0, 126.0) },
    { matchupId: 7303, sides: kickoffSides(9, 10, 60.0, -150, 125.0, 118.0) },
    { matchupId: 7304, sides: kickoffSides(11, 12, 68.0, -213, 128.0, 118.0) },
  ]),
  /* The close for the three Sunday games. */
  kickoffSnapshot('2026-09-27T15:00:00Z', 'scheduled', [
    { matchupId: 7301, sides: kickoffSides(5, 6, 64.0, -178, 130.1, 118.0) },
    { matchupId: 7302, sides: kickoffSides(7, 8, 51.2, -105, 121.0, 120.1) },
    { matchupId: 7303, sides: kickoffSides(9, 10, 57.0, -133, 124.0, 120.1) },
    { matchupId: 7304, sides: kickoffSides(11, 12, 71.5, -251, 128.0, 118.0) },
  ]),
  /* From here on, Sunday's scores are pinned into every Sunday game. */
  kickoffSnapshot('2026-09-27T22:00:00Z', 'scheduled', [
    { matchupId: 7301, sides: kickoffSides(5, 6, 97.0, -3233, 150.2, 101.3) },
    { matchupId: 7302, sides: kickoffSides(7, 8, 75.8, -313, 139.9, 118.4) },
    { matchupId: 7303, sides: kickoffSides(9, 10, 88.0, -733, 148.8, 119.7) },
    { matchupId: 7304, sides: kickoffSides(11, 12, 71.5, -251, 128.0, 118.0) },
  ]),
  kickoffSnapshot('2026-09-28T10:00:00Z', 'scheduled', [
    { matchupId: 7301, sides: kickoffSides(5, 6, 99.9, -99900, 151.0, 100.7) },
    { matchupId: 7302, sides: kickoffSides(7, 8, 75.8, -313, 139.9, 118.4) },
    { matchupId: 7303, sides: kickoffSides(9, 10, 88.0, -733, 148.8, 119.7) },
    { matchupId: 7304, sides: kickoffSides(11, 12, 71.5, -251, 128.0, 118.0) },
  ]),
];

function kickoffMap(mondayKickoff: string) {
  const sunday = ['KC', 'BUF', 'PHI', 'DAL', 'SF', 'LAR', 'SEA', 'ARI', 'DET', 'GB', 'MIN', 'CHI'];
  const monday = ['NYJ', 'MIA', 'NE', 'PIT'];
  return new Map([
    ...sunday.map((team) => [team, { kickoffIso: KICKOFF_SUNDAY }] as const),
    ...monday.map((team) => [team, { kickoffIso: mondayKickoff }] as const),
  ]);
}

const KICKOFFS_MONDAY_TO_PLAY = kickoffMap(KICKOFF_NOT_YET);
const KICKOFFS_ALL_STARTED = kickoffMap(KICKOFF_MONDAY);

export function DesignBoardRowPage() {
  const { variant } = useParams<{ variant?: string }>();
  /* The slip scene drives the real component with real state, so a rendered
     test can tap cells and read what actually comes back rather than
     asserting against a hand-built list. */
  const [legs, setLegs] = useState<ParlayLeg[]>([]);

  if (!isVariant(variant)) {
    return <Navigate replace to="/design/board-row/collision" />;
  }

  const matchups =
    variant === 'collision'
      ? collisionMatchups
      : variant === 'truncation'
        ? truncationMatchups
        : variant === 'detail'
          ? detailMatchups
          : variant === 'kickoff'
            ? kickoffMatchups
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
      {variant === 'slip' ? (
        <>
          <MatchupSlate
            currentWeek={8}
            forks={DESIGN_FORKS}
            gameOfTheWeek={7101}
            matchups={matchups}
            onToggleLeg={(leg) => setLegs((current) => toggleLeg(current, leg))}
            slipLegs={legs}
          />
          <BetSlip
            leagueName="Mount Olympus"
            legs={legs}
            onClear={() => setLegs([])}
            onRemove={(key) => setLegs((current) => removeLeg(current, key))}
            week={8}
          />
        </>
      ) : variant === 'game-of-the-week' ? (
        <>
          <MatchupSlate currentWeek={8} gameOfTheWeek={7101} matchups={matchups} />
          {/* The same board a moment earlier, while the conditioned run is
              still going. No ribbon anywhere, including on the card that has
              no id of its own to be matched by. */}
          <MatchupSlate currentWeek={8} gameOfTheWeek={null} matchups={matchups} />
        </>
      ) : variant === 'kickoff' ? (
        <>
          <MatchupSlate
            currentWeek={8}
            history={kickoffHistory}
            kickoffs={KICKOFFS_MONDAY_TO_PLAY}
            matchups={matchups}
          />
          {/* The same night after the Monday game has kicked off too: every
              game is read at its close. */}
          <MatchupSlate
            currentWeek={8}
            history={kickoffHistory}
            kickoffs={KICKOFFS_ALL_STARTED}
            matchups={matchups}
          />
        </>
      ) : (
        <MatchupSlate currentWeek={8} history={history} matchups={matchups} />
      )}
    </div>
  );
}
