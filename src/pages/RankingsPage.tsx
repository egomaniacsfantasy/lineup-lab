import { useEffect, useState } from 'react';
import { ConsensusTable } from '../components/rankings/ConsensusTable';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { toPlayer } from '../adapters/connectedLeague';
import { MOCK_CONSENSUS_RANKINGS } from '../mocks';
import type { ConsensusRanking } from '../types';
import './RankingsPage.css';

interface ModelRanking {
  rank: number;
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  mean: number;
  tier: number | null;
  derived: boolean;
}

// SCOPE: POST-MVP — the ranking mechanic + Pro raffle are not in the mobile
// MVP. Connected leagues see the real Olympus model board; the consensus
// submissions fiction stays demo-only.
export function RankingsPage() {
  const { bootstrap } = useLeagueConnection();
  const [model, setModel] = useState<{ version: string; rankings: ModelRanking[] } | null>(null);

  useEffect(() => {
    if (!bootstrap) return;

    let cancelled = false;
    fetch('/api/rankings?limit=60')
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload.available) {
          setModel({ version: payload.version, rankings: payload.rankings });
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  const realRankings: ConsensusRanking[] | null =
    bootstrap && model
      ? model.rankings.map((row) => {
          const positionRank = model.rankings
            .filter((other) => other.position === row.position)
            .findIndex((other) => other.playerId === row.playerId) + 1;

          return {
            rank: row.rank,
            player: toPlayer(row.playerId, bootstrap.players),
            eloRating: Math.round(row.mean * 100),
            tier: row.tier ? `Tier ${row.tier}` : row.rank <= 12 ? 'Elite' : row.rank <= 36 ? 'Starter' : 'Depth',
            positionRank,
            trend: 'stable' as const,
            trendDelta: 0,
          };
        })
      : null;

  return (
    <div className="rankings-page">
      <h1 className="visually-hidden">Rankings</h1>
      {!bootstrap ? (
        <div className="rankings-page__main">
          <RankingMechanic />
        </div>
      ) : null}
      <div className="rankings-page__sidebar">
        <ConsensusTable
          rankings={realRankings ?? MOCK_CONSENSUS_RANKINGS}
          sourceLabel={
            realRankings && model ? `Olympus model (${model.version})` : undefined
          }
        />
      </div>
    </div>
  );
}
