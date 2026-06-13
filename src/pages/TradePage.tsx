import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { TradeTargetsList } from '../components/trade/TradeTargetsList';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { toPlayer } from '../adapters/connectedLeague';
import { formatAmericanOdds } from '../utils/formatOdds';
import { MOCK_TRADE_TARGET_GROUPS } from '../mocks';
import './TradePage.css';

export function TradePage() {
  const { bootstrap, pricing } = useLeagueConnection();

  // Connected leagues see ONLY real, priced trade lanes. A lane only
  // exists when both sides gain projected points: you upgrade a starter,
  // they upgrade a starter, and the players sit in the same value band.
  if (bootstrap) {
    const lanes = pricing?.available
      ? (pricing.movers ?? []).filter((mover) => mover.kind === 'trade')
      : [];

    return (
      <div className="trade-page">
        <h1 className="visually-hidden">Trade lanes</h1>

        <section className="trade-page__real-module">
          <p className="trade-page__real-kicker">Trade lanes</p>
          <h2 className="trade-page__real-title">Deals both sides should take</h2>
          <p className="trade-page__real-subhead">
            Scanned from every roster in {bootstrap.league.name}: you upgrade a
            starter, they upgrade a starter. Priced in your title odds.
          </p>

          {lanes.length > 0 ? (
            lanes.map((lane) => {
              const give = lane.givePlayerId
                ? toPlayer(lane.givePlayerId, bootstrap.players)
                : null;
              const get = lane.getPlayerId
                ? toPlayer(lane.getPlayerId, bootstrap.players)
                : null;

              return (
                <article className="trade-page__lane" key={lane.headline + lane.detail}>
                  <p className="trade-page__lane-headline">{lane.headline}</p>
                  <div className="trade-page__lane-players">
                    {give ? (
                      <div className="trade-page__lane-player">
                        <PlayerHeadshot
                          className="trade-page__lane-headshot"
                          fallbackClassName="trade-page__lane-headshot-fallback"
                          imageClassName="trade-page__lane-headshot-image"
                          player={give}
                        />
                        <div>
                          <p className="trade-page__lane-direction">You send</p>
                          <p className="trade-page__lane-name">{give.shortName}</p>
                        </div>
                      </div>
                    ) : null}
                    <span aria-hidden="true" className="trade-page__lane-arrows">
                      ⇄
                    </span>
                    {get ? (
                      <div className="trade-page__lane-player">
                        <PlayerHeadshot
                          className="trade-page__lane-headshot"
                          fallbackClassName="trade-page__lane-headshot-fallback"
                          imageClassName="trade-page__lane-headshot-image"
                          player={get}
                        />
                        <div>
                          <p className="trade-page__lane-direction">You get</p>
                          <p className="trade-page__lane-name">{get.shortName}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <p className="trade-page__lane-price">
                    Your title odds{' '}
                    <s>{formatAmericanOdds(lane.titleOddsBefore)}</s>{' '}
                    <strong>{formatAmericanOdds(lane.titleOddsAfter)}</strong>
                  </p>
                </article>
              );
            })
          ) : (
            <SeasonalNotice>
              {pricing?.available
                ? 'No deal on the board helps both sides right now. Lanes reprice with every projections update and roster change.'
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
      <TradeTargetsList groups={MOCK_TRADE_TARGET_GROUPS} />
    </div>
  );
}
