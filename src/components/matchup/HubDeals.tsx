import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { formatAmericanOdds } from '../../utils/formatOdds';
import './HubDeals.css';

/**
 * The hub's way into trading.
 *
 * This deliberately does NOT price deals. An earlier version ran the
 * league-wide `suggestTrades` scan here and rendered tickets, which meant the
 * landing page carried a season sim across every opponent before it could
 * finish. Trading starts with a person, not a package: the hub asks who you
 * want to do business with and hands off to Trades, where the book actually
 * prices it.
 *
 * The title price on each manager is read from `pricing.futures`, which the
 * page already has, so the board costs nothing to render.
 */
export function HubDeals() {
  const { bootstrap, pricing } = useLeagueConnection();
  const navigate = useNavigate();

  const partners = useMemo(() => {
    if (!bootstrap) return [];
    const futuresByRoster = new Map(
      (pricing?.available ? pricing.futures ?? [] : []).map((row) => [row.rosterId, row]),
    );
    return bootstrap.teams
      .filter((team) => !team.isUser)
      .map((team) => {
        const future = futuresByRoster.get(team.rosterId);
        return {
          rosterId: team.rosterId,
          teamName: team.teamName,
          record: future?.record
            ? `${future.record.wins}-${future.record.losses}`
            : null,
          titleOdds: future?.championOdds ?? null,
        };
      });
  }, [bootstrap, pricing]);

  if (!bootstrap || partners.length === 0) return null;

  return (
    <section className="hub-deals">
      <div className="hub-deals__head">
        <div>
          <p className="matchup-page__eyebrow">Trade finder</p>
          <h2 className="matchup-page__module-title">Who do you want to do business with?</h2>
          <p className="hub-deals__sub">
            Pick a manager and the book builds the deals they would actually say yes to.
          </p>
        </div>
      </div>

      <div className="hub-deals__managers">
        {partners.map((partner) => (
          <button
            className="hub-deals__manager"
            key={partner.rosterId}
            onClick={() => navigate(`/market?view=deals&manager=${partner.rosterId}`)}
            type="button"
          >
            <span className="hub-deals__manager-copy">
              <span className="hub-deals__manager-name">{partner.teamName}</span>
              {partner.record ? (
                <span className="hub-deals__manager-record">{partner.record}</span>
              ) : null}
            </span>
            {partner.titleOdds != null ? (
              <span className="hub-deals__manager-price">
                <span className="hub-deals__manager-price-label">Title</span>
                <span className="hub-deals__manager-price-value">
                  {formatAmericanOdds(partner.titleOdds)}
                </span>
              </span>
            ) : null}
            <span aria-hidden="true" className="hub-deals__manager-cue">Find trades ›</span>
          </button>
        ))}
      </div>
    </section>
  );
}
