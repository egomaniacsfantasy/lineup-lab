import { useEffect, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { SUCCESSOR_SUFFIX, connectionForDesignScene, type DesignScene } from '../dev/designFixtures';
import { LeaguePage } from './LeaguePage';
import { MatchupPage } from './MatchupPage';
import { MyBoardPage } from './MyBoardPage';
import { TradePage } from './TradePage';

const SCENES: Record<DesignScene, ReactElement> = {
  'matchup-cold': <MatchupPage />,
  matchup: <MatchupPage />,
  'matchup-live': <MatchupPage />,
  market: <TradePage />,
  league: <LeaguePage />,
  board: <MyBoardPage />,
};

function isDesignScene(value: string | undefined): value is DesignScene {
  return value != null && value in SCENES;
}

export function DesignFixturePage() {
  const { scene } = useParams<{ scene?: string }>();
  const { stored, connect } = useLeagueConnection();
  const validScene = isDesignScene(scene);
  const target = validScene ? connectionForDesignScene(scene) : null;

  /* A league this scene is allowed to be showing.
   *
   * The scene's own league, or the one it rolls over into. ?staleSeason makes
   * the fixture answer as last season, and the app now follows the chain to
   * this season by itself, so the connection legitimately changes underneath
   * this page. Insisting on an exact match made the two fight: the app
   * switched forward, this switched back, and the scene rendered an error for
   * a league neither of them was serving. */
  const onScene = (leagueId: string | undefined) =>
    leagueId != null
    && (leagueId === target?.leagueId || leagueId === `${target?.leagueId}${SUCCESSOR_SUFFIX}`);

  useEffect(() => {
    if (!target) return;
    if (onScene(stored?.leagueId)) return;
    connect(target);
  });

  if (!validScene || !target) {
    return <Navigate replace to="/design/matchup" />;
  }

  if (!onScene(stored?.leagueId)) {
    return <div className="app-boot" aria-hidden="true" />;
  }

  return SCENES[scene];
}
