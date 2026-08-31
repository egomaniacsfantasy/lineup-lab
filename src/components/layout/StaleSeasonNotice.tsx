import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchLeagueSuccessor, type LeagueSuccessor } from '../../services/leagueApi';
import { connectedSeasonIsStale } from '../../utils/leagueCapabilities';
import './StaleSeasonNotice.css';

/**
 * You are looking at last season, and here is this season.
 *
 * Sleeper gives a dynasty or keeper league a NEW league id every year and
 * chains them by previous_league_id. A league connected last season keeps
 * answering for ever: last year's rosters, last year's records, and this
 * year's prices built on both. Nothing errors. It is a completely healthy
 * response to a question about the wrong year, which is why it can sit there
 * for months looking like a modelling problem.
 *
 * The first version of this said so and pointed at Connect, which left the
 * person to work out for themselves which of their leagues was the right one.
 * The server can walk the chain, so it does: of the leagues you are in this
 * season, which traces back to the one you have open. That makes the fix one
 * button instead of a scavenger hunt.
 *
 * It sits above everything because it invalidates everything: there is no
 * screen in this app that is still true when the roster behind it is a year
 * old.
 */
export function StaleSeasonNotice() {
  const { bootstrap, stored, connect } = useLeagueConnection();
  const [found, setFound] = useState<LeagueSuccessor | null>(null);
  const [switching, setSwitching] = useState(false);

  const stale = connectedSeasonIsStale(bootstrap);
  const leagueId = stored?.leagueId ?? null;
  const userId = stored?.userId ?? null;

  useEffect(() => {
    if (!stale || !leagueId || !userId) {
      setFound(null);
      return undefined;
    }
    let cancelled = false;
    fetchLeagueSuccessor(leagueId, userId)
      .then((result) => {
        if (!cancelled) setFound(result);
      })
      /* A failed lookup is not worth a second alarm. The banner still says
         the year is wrong, which is the part that matters, and falls back to
         sending you to Connect. */
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stale, leagueId, userId]);

  if (!stale || !bootstrap || !stored) return null;

  const successor = found?.successor ?? null;

  return (
    <aside className="stale-season" role="alert">
      <span className="stale-season__body">
        <strong>This is your {bootstrap.league.season} league.</strong> The current season
        is {bootstrap.state.season}, and every roster, record and price below is
        from last year.{' '}
        {/* Three different situations, three different things worth saying. A
            league nobody has rolled over yet is not a mistake the user made,
            and telling them to reconnect would send them looking for a league
            that does not exist. */}
        {successor
          ? `${successor.name} is your ${found?.season ?? bootstrap.state.season} league.`
          : found?.reason === 'not_rolled_over'
            ? `Nobody has started your ${found.season ?? bootstrap.state.season} league on Sleeper yet, so there is nothing to switch to.`
            : 'Dynasty and keeper leagues get a new league each season.'}
      </span>

      {successor ? (
        <button
          className="stale-season__action"
          disabled={switching}
          onClick={() => {
            setSwitching(true);
            /* Everything else about the connection is the same account and
               the same person; only the league changes. Rebuilding it from
               scratch would drop the ESPN credentials a stored connection can
               carry. */
            connect({
              ...stored,
              leagueId: successor.id,
              leagueName: successor.name,
              season: successor.season,
            });
          }}
          type="button"
        >
          {switching ? 'Switching…' : `Switch to ${found?.season ?? ''}`.trim()}
        </button>
      ) : found?.reason === 'not_rolled_over' ? null : (
        <Link className="stale-season__action" to="/connect">
          Connect this season
        </Link>
      )}
    </aside>
  );
}
