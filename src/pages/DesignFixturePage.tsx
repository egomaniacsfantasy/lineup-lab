import { useEffect, type ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { SUCCESSOR_SUFFIX, connectionForDesignScene, type DesignScene } from '../dev/designFixtures';
import { LeaguePage } from './LeaguePage';
import { MatchupPage } from './MatchupPage';
import { MyBoardPage } from './MyBoardPage';
import { TradePage } from './TradePage';
import { MobileHub } from '../components/layout/MobileHub';

const SCENES: Record<DesignScene, ReactElement> = {
  'matchup-cold': <MatchupPage />,
  matchup: <MatchupPage />,
  'matchup-live': <MatchupPage />,
  market: <TradePage />,
  league: <LeaguePage />,
  board: <MyBoardPage />,
  /* The signed-in phone screen. It needs a session and a connected league,
     and the design routes are the only way to reach a surface with neither. */
  'mobile-hub': <MobileHub />,
};

function isDesignScene(value: string | undefined): value is DesignScene {
  return value != null && value in SCENES;
}

export function DesignFixturePage({ scene: fixed }: { scene?: DesignScene } = {}) {
  /* The scene comes from the path, except where a route names it outright.
     
     One scene is mounted OUTSIDE the app shell, because the real thing is: a
     signed-in phone gets MobileHub on its own, and reviewing it under a
     five-tab bar would be the fixture disagreeing with the product about the
     screen being designed. A static route has no :scene param to read, so it
     hands the name in instead of leaving this to fall through to the
     default. */
  const params = useParams<{ scene?: string }>();
  const scene = fixed ?? params.scene;
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
