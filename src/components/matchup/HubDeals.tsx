import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TradeCard } from '../trade-display/TradeDisplay';
import { fetchTradeSuggestions, type TradeSuggestion } from '../../services/leagueApi';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { tradeSideFromIds } from '../../utils/tradeDisplay';
import { acceptanceGaugeLabel, applyTradeDisplayPolicy } from '../../utils/tradeSuggestionDisplay';
import { formatAcceptancePercent, getAcceptanceLingo } from '../../utils/acceptanceLingo';
import { samePositionOneForOneTrade } from '../../utils/tradeMarket';
import { analysisVerdict, deltaTone, signedPct } from '../../utils/tradeVerdict';
import { acceptanceProbability } from '../../utils/tradeAcceptance';
import './HubDeals.css';

const MAX_DEALS = 3;

/**
 * Deals worth doing, on the hub.
 *
 * Within Franco's framework and without a new endpoint: `suggestTrades` already
 * falls back to EVERY opponent when no `partnerRosterId` is given, and the
 * route caches that for five minutes. So the book's best deals across the
 * league are one existing call.
 *
 * That call is a league-wide season sim, so it can be slow on a cold cache.
 * The hub must never wait on it: this module mounts with the manager board
 * already useful, fetches after paint, and fills in. It never blocks the page
 * and it never shows a spinner where a number will land.
 */
export function HubDeals() {
  const { stored, bootstrap } = useLeagueConnection();
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<TradeSuggestion[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!stored || !bootstrap) return undefined;
    let cancelled = false;
    setState('loading');

    fetchTradeSuggestions(stored.leagueId, { userId: stored.userId })
      .then((response) => {
        if (cancelled) return;
        if (!response.available) {
          setState('error');
          return;
        }
        setSuggestions(response.suggestions ?? []);
        setState('done');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap, stored]);

  const partners = useMemo(
    () => (bootstrap?.teams ?? []).filter((team) => !team.isUser),
    [bootstrap],
  );

  /* Same filters Trades applies, so a deal cannot appear here and be missing
     there: same-position one-for-ones are noise, and the display policy drops
     Long shot acceptance. Order is the engine's. */
  const deals = useMemo(() => {
    if (!suggestions || !bootstrap) return [];
    const usable = suggestions.filter(
      (suggestion) =>
        !samePositionOneForOneTrade(
          {
            givePlayerIds: suggestion.give.map((asset) => asset.id),
            getPlayerIds: suggestion.get.map((asset) => asset.id),
          },
          bootstrap.players,
        ),
    );
    /* Neutral read: the hub has no per-manager sliders, so acceptance uses the
       same neutral 5/5 the analyzer defaults to. Picking a manager on Trades
       applies that manager's saved read and can move this number. */
    const withAcceptance = usable.map((suggestion) => ({
      suggestion,
      acceptanceProbability: acceptanceProbability(suggestion.partnerDelta, 5, 5),
    }));
    return applyTradeDisplayPolicy(withAcceptance).visible.slice(0, MAX_DEALS);
  }, [bootstrap, suggestions]);

  if (!stored || !bootstrap) return null;

  return (
    <section className="hub-deals">
      <div className="hub-deals__head">
        <div>
          <p className="matchup-page__eyebrow">Trade finder</p>
          <h2 className="matchup-page__module-title">Deals worth doing</h2>
        </div>
        <button
          className="hub-deals__all"
          onClick={() => navigate('/market?view=deals')}
          type="button"
        >
          Open trade finder
        </button>
      </div>

      {/* The manager board is useful immediately and does not wait on the sim,
          which is what keeps the hub from feeling stalled on a cold cache. */}
      <div className="hub-deals__managers">
        {partners.map((team) => (
          <button
            className="hub-deals__manager"
            key={team.rosterId}
            onClick={() => navigate(`/market?view=deals&manager=${team.rosterId}`)}
            type="button"
          >
            <span className="hub-deals__manager-name">{team.teamName}</span>
            <span className="hub-deals__manager-cue">Find trades</span>
          </button>
        ))}
      </div>

      {state === 'loading' ? (
        <p className="hub-deals__note">The book is pricing deals with all {partners.length} managers…</p>
      ) : null}

      {state === 'error' ? (
        <p className="hub-deals__note">Could not price deals right now. The trade finder still works.</p>
      ) : null}

      {state === 'done' && deals.length === 0 ? (
        <p className="hub-deals__note">
          No deal across the league moves your title odds enough to suggest. Pick a manager above to look yourself.
        </p>
      ) : null}

      {deals.length > 0 ? (
        <div className="hub-deals__grid">
          {deals.map((entry) => {
            const verdict = analysisVerdict(entry.suggestion.youDelta);
            return (
              <TradeCard
                acceptanceBand={getAcceptanceLingo(entry.acceptanceProbability)?.label ?? null}
                acceptanceLabel={acceptanceGaugeLabel(entry.acceptanceProbability)}
                acceptanceProbability={entry.acceptanceProbability}
                acceptanceValue={formatAcceptancePercent(entry.acceptanceProbability)}
                getSide={tradeSideFromIds(
                  'You get',
                  entry.suggestion.get.map((asset) => asset.id),
                  bootstrap.players,
                )}
                impactRows={[
                  {
                    label: 'Your title',
                    value: signedPct(entry.suggestion.youDelta),
                    tone: deltaTone(entry.suggestion.youDelta),
                    emphasis: 'lead',
                    mirror: {
                      label: 'them',
                      value: signedPct(entry.suggestion.partnerDelta),
                      tone: deltaTone(entry.suggestion.partnerDelta),
                    },
                  },
                  ...(entry.suggestion.youPlayoffDelta != null
                    ? [{
                        label: 'Playoffs',
                        value: signedPct(entry.suggestion.youPlayoffDelta),
                        tone: deltaTone(entry.suggestion.youPlayoffDelta),
                        emphasis: 'primary' as const,
                        mirror: {
                          label: 'them',
                          value: signedPct(entry.suggestion.partnerPlayoffDelta ?? 0),
                          tone: deltaTone(entry.suggestion.partnerPlayoffDelta ?? 0),
                        },
                      }]
                    : []),
                  ...(entry.suggestion.youWeekDelta != null
                    ? [{
                        label: 'This week',
                        value: signedPct(entry.suggestion.youWeekDelta),
                        tone: deltaTone(entry.suggestion.youWeekDelta),
                        emphasis: 'primary' as const,
                        mirror: {
                          label: 'them',
                          value: signedPct(entry.suggestion.partnerWeekDelta ?? 0),
                          tone: deltaTone(entry.suggestion.partnerWeekDelta ?? 0),
                        },
                      }]
                    : []),
                ]}
                key={`${entry.suggestion.partnerRosterId}-${entry.suggestion.give.map((a) => a.id).join('-')}`}
                onClick={() => navigate(`/market?view=deals&manager=${entry.suggestion.partnerRosterId}`)}
                partnerLine={entry.suggestion.partnerName ?? null}
                sendSide={tradeSideFromIds(
                  'You send',
                  entry.suggestion.give.map((asset) => asset.id),
                  bootstrap.players,
                )}
                verdictLabel={verdict.label}
                verdictTone={verdict.tone}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
