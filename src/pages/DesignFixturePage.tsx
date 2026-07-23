import { useEffect, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { connectionForDesignScene, type DesignScene } from '../dev/designFixtures';
import { LeaguePage } from './LeaguePage';
import { MatchupPage } from './MatchupPage';
import { TradePage } from './TradePage';

const SCENES: Record<DesignScene, ReactElement> = {
  'matchup-cold': <MatchupPage />,
  matchup: <MatchupPage />,
  'matchup-live': <MatchupPage />,
  market: <TradePage />,
  league: <LeaguePage />,
};

function isDesignScene(value: string | undefined): value is DesignScene {
  return value != null && value in SCENES;
}

export function DesignFixturePage() {
  const { scene } = useParams<{ scene?: string }>();
  const { stored, connect } = useLeagueConnection();
  const validScene = isDesignScene(scene);
  const target = validScene ? connectionForDesignScene(scene) : null;

  useEffect(() => {
    if (!target) return;
    if (stored?.leagueId === target.leagueId) return;
    connect(target);
  }, [connect, stored?.leagueId, target]);

  if (!validScene || !target) {
    return <Navigate replace to="/design/matchup" />;
  }

  if (stored?.leagueId !== target.leagueId) {
    return <div className="app-boot" aria-hidden="true" />;
  }

  return SCENES[scene];
}
