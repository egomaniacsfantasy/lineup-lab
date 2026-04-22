import type { DraftSlotResult, DraftWrappedData } from '../types';
import { MOCK_PLAYERS } from './players';

export const MOCK_DRAFT_SLOT_ODDS: DraftSlotResult = {
  leagueStyle: 'competitive',
  slots: [
    {
      position: 1,
      championshipOdds: 380,
      winProbability: 20.8,
      projectedRecord: '9-5',
    },
    {
      position: 2,
      championshipOdds: 420,
      winProbability: 19.2,
      projectedRecord: '9-5',
    },
    {
      position: 3,
      championshipOdds: 450,
      winProbability: 18.2,
      projectedRecord: '9-5',
    },
    {
      position: 4,
      championshipOdds: 500,
      winProbability: 16.7,
      projectedRecord: '8-6',
    },
    {
      position: 5,
      championshipOdds: 520,
      winProbability: 16.1,
      projectedRecord: '8-6',
    },
    {
      position: 6,
      championshipOdds: 580,
      winProbability: 14.7,
      projectedRecord: '8-6',
    },
    {
      position: 7,
      championshipOdds: 650,
      winProbability: 13.3,
      projectedRecord: '8-6',
    },
    {
      position: 8,
      championshipOdds: 700,
      winProbability: 12.5,
      projectedRecord: '7-7',
    },
    {
      position: 9,
      championshipOdds: 750,
      winProbability: 11.8,
      projectedRecord: '7-7',
    },
    {
      position: 10,
      championshipOdds: 800,
      winProbability: 11.1,
      projectedRecord: '7-7',
    },
    {
      position: 11,
      championshipOdds: 850,
      winProbability: 10.5,
      projectedRecord: '7-7',
    },
    {
      position: 12,
      championshipOdds: 900,
      winProbability: 10.0,
      projectedRecord: '7-7',
    },
  ],
};

export const MOCK_DRAFT_WRAPPED: DraftWrappedData = {
  teamName: "Zeus's Bolts",
  leagueName: 'Mount Olympus League · 2024 Replay',
  championshipOdds: 450,
  projectedRecord: '9-5',
  recordRange: { best: '12-2', worst: '6-8', median: '9-5' },
  leagueRank: 3,
  boldestPick: {
    player: MOCK_PLAYERS.lamb,
    pickNumber: 18,
    adpDelta: 8,
  },
  toughestMatchup: {
    week: 9,
    opponent: 'Apollo Archers',
    odds: 150,
  },
  easiestMatchup: {
    week: 11,
    opponent: 'Hades Hounds',
    odds: -310,
  },
  rosterGrade: 'A-',
};
