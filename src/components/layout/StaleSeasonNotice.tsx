import { Link } from 'react-router-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { connectedSeasonIsStale } from '../../utils/leagueCapabilities';
import './StaleSeasonNotice.css';

/**
 * You are looking at last season.
 *
 * Sleeper gives a dynasty or keeper league a NEW league id every year and
 * chains them by previous_league_id. A league connected last season therefore
 * keeps answering for ever: last year's rosters, last year's records, and
 * this year's prices built on both. Nothing errors. It is a completely
 * healthy response to a question about the wrong year, which is why it can
 * sit there for months looking like a modelling problem.
 *
 * It sits above everything because it invalidates everything: there is no
 * screen in this app that is still true when the roster behind it is a year
 * old, so a notice tucked into one of them would be the only honest thing on
 * a page of confident wrong numbers.
 */
export function StaleSeasonNotice() {
  const { bootstrap } = useLeagueConnection();
  if (!connectedSeasonIsStale(bootstrap) || !bootstrap) return null;

  return (
    <aside className="stale-season" role="alert">
      <span className="stale-season__body">
        <strong>This is your {bootstrap.league.season} league.</strong> The current season
        is {bootstrap.state.season}, and every roster, record and price below is
        from last year. Dynasty and keeper leagues get a new league each season,
        so this year&rsquo;s is a separate one to connect.
      </span>
      <Link className="stale-season__action" to="/connect">
        Connect this season
      </Link>
    </aside>
  );
}
