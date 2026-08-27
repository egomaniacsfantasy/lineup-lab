import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchTradeSuggestions, type TradeSuggestion } from '../../services/leagueApi';
import { sortByTradeFairness } from '../../utils/tradeSuggestionDisplay';
import { acceptableDeals } from '../../utils/dealBoardPolicy';
import { signedPct } from '../../utils/tradeVerdict';
import { toPlayer } from '../../adapters/connectedLeague';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import './HubDeals.css';

const SHOWN = 2;
const CACHE_PREFIX = 'og.hubDeals.';

/**
 * The two deals the book would actually make.
 *
 * The league-wide scan was tried on the hub once before and backed out because
 * the page carried a season sim across every opponent before it could finish.
 * The fault was that the hub waited, not that the scan ran, so it runs
 * fire-and-forget and the widget renders a skeleton until it lands.
 *
 * The result is kept in sessionStorage. A scan takes real seconds and the old
 * behaviour re-ran it on every return to the hub, so deals appeared, vanished
 * on navigation, and made you wait again to see the same two rows.
 */
const DEALS_TTL_MS = 120_000;

function readCache(key: string): { at: number; deals: TradeSuggestion[] } | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { at: 0, deals: parsed as TradeSuggestion[] };
    if (Array.isArray(parsed?.data)) return { at: parsed.at ?? 0, deals: parsed.data as TradeSuggestion[] };
    return null;
  } catch {
    return null;
  }
}

function writeCache(key: string, deals: TradeSuggestion[]) {
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data: deals }));
  } catch {
    // storage unavailable; the scan simply runs again next time
  }
}

/* A league-wide scan takes a while because it is pricing every roster, and a
   single frozen line makes that read as stuck. These rotate in the voice the
   rest of the app already uses for a wait: a book working, not a spinner
   apologising. */
const SCAN_LINES = [
  'Pricing every roster in the league...',
  'Working the phones...',
  'Reading who needs what...',
  'Testing who says yes...',
  'Checking their depth charts...',
  'Sounding out the market...',
];

export function HubDeals() {
  const { stored, bootstrap } = useLeagueConnection();
  const navigate = useNavigate();
  const cacheKey = stored ? `${stored.leagueId}:${stored.userId}` : '';
  const [deals, setDeals] = useState<TradeSuggestion[] | null>(() =>
    cacheKey ? readCache(cacheKey)?.deals ?? null : null,
  );
  const [scanLine, setScanLine] = useState(0);

  /* Only while there is nothing to show. Once the deals land the copy is
     irrelevant and a timer left running is just a re-render every few
     seconds. */
  useEffect(() => {
    if (deals !== null) return undefined;
    const timer = window.setInterval(
      () => setScanLine((current) => (current + 1) % SCAN_LINES.length),
      2600,
    );
    return () => window.clearInterval(timer);
  }, [deals]);

  useEffect(() => {
    if (!stored?.leagueId || !stored.userId || !bootstrap) return undefined;
    // Skip the heavy scan when we have a RECENT cached result; otherwise refetch so the
    // hub deals don't freeze on stale numbers for the whole session (which made them
    // disagree with fresh computations elsewhere).
    const cached = readCache(cacheKey);
    if (cached && Date.now() - cached.at < DEALS_TTL_MS) return undefined;
    let cancelled = false;
    void fetchTradeSuggestions(stored.leagueId, {
      userId: stored.userId,
      partnerRosterId: null,
    })
      .then((response) => {
        if (cancelled || !response.available) return;
        /* Same filter as the Trades board, then the same sort. Applied in
           both places rather than one: the Hub and the Trades tab draw from
           the same pool, so a deal barred from one and shown on the other is
           the product disagreeing with itself in front of the reader.

           Fairest first after that: the trade that moves BOTH teams'
           championship odds the least (|youDelta| + |partnerDelta|).
           Acceptance probability is not part of this. */
        const { kept } = acceptableDeals(
          response.suggestions ?? [],
          (playerId) => bootstrap.players[playerId]?.position ?? null,
          bootstrap.league.rosterPositions,
        );
        const ranked = sortByTradeFairness(kept).slice(0, SHOWN);
        setDeals(ranked);
        writeCache(cacheKey, ranked);
      })
      .catch(() => {
        if (!cancelled) setDeals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stored?.leagueId, stored?.userId, bootstrap, cacheKey]);

  if (!bootstrap) return null;

  /* A blank rectangle reads as broken. Two skeleton rows say the same thing
     honestly: something is coming, and this is the shape of it. */
  if (deals === null) {
    /* A grey rectangle says "broken". A ghost of the row that is coming says
       "a trade is being built", which is both true and the same shape as the
       answer, so nothing jumps when it lands. */
    return (
      <section className="matchup-page__module hub-deals hub-deals--loading">
        {[0, 1].map((row) => (
          <span className="hub-deals__ghost" key={row}>
            <span className="hub-deals__ghost-swap">
              <span className="hub-deals__ghost-side">
                <span className="hub-deals__ghost-face" />
                <span className="hub-deals__ghost-face" />
              </span>
              <span aria-hidden="true" className="hub-deals__ghost-arrow">⇄</span>
              <span className="hub-deals__ghost-side hub-deals__ghost-side--get">
                <span className="hub-deals__ghost-face" />
                <span className="hub-deals__ghost-face" />
              </span>
            </span>
            <span className="hub-deals__ghost-meta" />
          </span>
        ))}
        <p className="hub-deals__pending">
          <span aria-hidden="true" className="hub-deals__pulse" />
          <span className="hub-deals__pending-line">{SCAN_LINES[scanLine]}</span>
        </p>
      </section>
    );
  }

  if (deals.length === 0) return null;

  const side = (assets: { id: string; name: string }[]) =>
    assets.map((asset) => toPlayer(asset.id, bootstrap.players));

  return (
    <section className="matchup-page__module hub-deals">
      {deals.map((deal) => {
        const give = side(deal.give);
        const get = side(deal.get);
        return (
          <button
            className="hub-deals__row"
            key={`${deal.partnerRosterId}:${deal.give.map((a) => a.id).join('+')}`}
            onClick={() => {
              const params = new URLSearchParams({
                managerRosterId: String(deal.partnerRosterId),
                give: deal.give.map((a) => a.id).join(','),
                get: deal.get.map((a) => a.id).join(','),
                view: 'build',
              });
              if (stored?.leagueId) params.set('leagueId', stored.leagueId);
              navigate(`/market?${params.toString()}`);
            }}
            type="button"
          >
            <span className="hub-deals__swap">
              <span className="hub-deals__side">
                <span className="hub-deals__faces">
                  {give.map((player) => (
                    <PlayerHeadshot className="hub-deals__face" key={player.id} player={player} />
                  ))}
                </span>
                <span className="hub-deals__names">
                  {give.map((p) => p.shortName).join(', ')}
                </span>
              </span>

              <span aria-hidden="true" className="hub-deals__arrow">⇄</span>

              <span className="hub-deals__side hub-deals__side--get">
                <span className="hub-deals__faces">
                  {get.map((player) => (
                    <PlayerHeadshot className="hub-deals__face" key={player.id} player={player} />
                  ))}
                </span>
                <span className="hub-deals__names">
                  {get.map((p) => p.shortName).join(', ')}
                </span>
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
        );
      })}
    </section>
  );
}
