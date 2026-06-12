import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { useSeasonMode } from '../hooks/useSeasonMode';
import { formatAmericanOdds } from '../utils/formatOdds';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import './TradePage.css';

export function TradePage() {
  const { mode } = useSeasonMode();
  const { bootstrap, pricing } = useLeagueConnection();

  // Connected leagues see ONLY real, priced trade lanes — the mock target
  // groups are demo fiction and never render alongside a real roster.
  if (bootstrap) {
    const lanes = pricing?.available
      ? (pricing.movers ?? []).filter((mover) => mover.kind === 'trade')
      : [];

    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Trade lanes</h1>

        <section className="trade-page__real-module">
          <p className="trade-page__real-kicker">Trade lanes</p>
          <h2 className="trade-page__real-title">
            Priced against {bootstrap.league.name}
          </h2>
          <p className="trade-page__real-subhead">
            Every lane is a real mutual-need swap from live rosters, priced in
            your title odds.
          </p>

          {lanes.length > 0 ? (
            lanes.map((lane) => (
              <div className="trade-page__lane" key={lane.headline}>
                <div>
                  <p className="trade-page__lane-headline">{lane.headline}</p>
                  <p className="trade-page__lane-detail">{lane.detail}</p>
                </div>
                <p className="trade-page__lane-price">
                  <s>{formatAmericanOdds(lane.titleOddsBefore)}</s>{' '}
                  <strong>{formatAmericanOdds(lane.titleOddsAfter)}</strong>
                </p>
              </div>
            ))
          ) : (
            <SeasonalNotice>
              {pricing?.available
                ? 'No mutually positive trade lane on the board right now. Lanes reprice with every projections import and roster change.'
                : 'Trade lanes price once projections are imported.'}
            </SeasonalNotice>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="trade-page">
      <h1 className="visually-hidden">Trade targets</h1>
      {mode === 'preseason' ? (
        <SeasonalNotice>
          Trade analyzer opens Week 1. This preview prices the 2024 replay
          rosters.
        </SeasonalNotice>
      ) : null}
      <TradeTargetsList groups={MOCK_TRADE_TARGET_GROUPS} />
    </div>
  );
}
