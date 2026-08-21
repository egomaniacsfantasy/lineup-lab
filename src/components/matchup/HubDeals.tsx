import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchTradeSuggestions, type TradeSuggestion } from '../../services/leagueApi';
import { acceptanceWeightedValue } from '../../utils/tradeSuggestionDisplay';
import { acceptanceProbability } from '../../utils/tradeAcceptance';
import { signedPct } from '../../utils/tradeVerdict';
import './HubDeals.css';

const SHOWN = 2;

/**
 * The two deals the book would actually make, on the hub.
 *
 * This widget used to be a manager picker — "who do you want to do business
 * with" — because an earlier attempt at running the league-wide scan here made
 * the landing page carry a season sim across every opponent before it could
 * finish. That was the right thing to back out, but the wrong lesson: the
 * problem was that the hub WAITED for it, not that it ran.
 *
 * So it runs, and nothing waits. The widget renders nothing at all until the
 * scan resolves, so the hub's first paint is unaffected. The result also warms
 * the server's cache for this league, which means opening Trades afterwards
 * finds a board already priced instead of an empty one.
 *
 * "Best" is not invented here. sortTradeSuggestions ranks by acceptance
 * weighted value — what a deal gains you multiplied by the chance they say
 * yes — because a title bump nobody accepts is worth nothing.
 */
export function HubDeals() {
  const { stored, bootstrap } = useLeagueConnection();
  const [deals, setDeals] = useState<TradeSuggestion[] | null>(null);

  useEffect(() => {
    if (!stored?.leagueId || !stored.userId || !bootstrap) return undefined;
    let cancelled = false;
    /* Deliberately fire-and-forget. A failure here is silence, not an error
       card: the hub has plenty to say without this. */
    void fetchTradeSuggestions(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: null,
    })
      .then((response) => {
        if (cancelled || !response.available) return;
        /* Same ranking the Trades tab uses: what it gains you multiplied by
           the chance they take it. Acceptance comes from the partner's own
           title delta against a neutral 5/5 read, because the hub has no
           per-manager read to apply and inventing one would be worse. */
        const ranked = [...(response.suggestions ?? [])]
          .map((suggestion) => ({
            suggestion,
            weight: acceptanceWeightedValue({
              valueGain: suggestion.youDelta,
              acceptanceProbability: acceptanceProbability(suggestion.partnerDelta, 5, 5),
            }),
          }))
          .sort((a, b) => b.weight - a.weight)
          .map((entry) => entry.suggestion);
        setDeals(ranked.slice(0, SHOWN));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stored?.leagueId, stored?.userId, bootstrap]);

  const navigate = useNavigate();
  if (!deals || deals.length === 0) return null;

  return (
    <div className="hub-deals">
      {deals.map((deal) => (
        <button
          className="hub-deals__row"
          key={`${deal.partnerRosterId}:${deal.give.map((a) => a.id).join('+')}`}
          onClick={() => navigate(`/market?manager=${deal.partnerRosterId}`)}
          type="button"
        >
          <span className="hub-deals__swap">
            <span className="hub-deals__side">{deal.give.map((a) => a.name).join(' + ')}</span>
            <span aria-hidden="true" className="hub-deals__arrow">⇄</span>
            <span className="hub-deals__side hub-deals__side--get">
              {deal.get.map((a) => a.name).join(' + ')}
            </span>
          </span>
          <span className="hub-deals__meta">
            <span className="hub-deals__partner">{deal.partnerName}</span>
            <span
              className={[
                'hub-deals__delta',
                deal.youDelta >= 0 ? 'hub-deals__delta--up' : 'hub-deals__delta--down',
              ].join(' ')}
            >
              {signedPct(deal.youDelta)} title
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
