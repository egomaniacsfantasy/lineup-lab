import type { ApiTeam } from '../../services/leagueApi';
import './StandingsTable.css';
import { resolveApiUrl } from '../../services/apiBase.ts';

function recordLabel(r: { wins: number; losses: number; ties: number }) {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

/**
 * Current league standings — the same wins-then-points-for order the season sim
 * seeds playoffs by, so it doubles as a check that the sim is reading each team's
 * record and points correctly.
 */
export function StandingsTable({
  teams,
  playoffTeams,
}: {
  teams: ApiTeam[];
  playoffTeams?: number | null;
}) {
  const sorted = [...teams].sort(
    (a, b) => b.record.wins - a.record.wins || b.pointsFor - a.pointsFor,
  );

  return (
    <section className="standings" aria-label="League standings">
      <div className="standings__head">
        <h2 className="standings__title">Standings</h2>
        <span className="standings__sub">
          Ordered by wins, then points for — the same tiebreak the sim seeds playoffs on.
        </span>
      </div>

      <div className="standings__table" role="table">
        <div className="standings__row standings__row--head" role="row">
          <span className="standings__cell standings__cell--rank" role="columnheader">#</span>
          <span className="standings__cell standings__cell--team" role="columnheader">Team</span>
          <span className="standings__cell standings__cell--num" role="columnheader">Record</span>
          <span className="standings__cell standings__cell--num" role="columnheader">PF</span>
          <span className="standings__cell standings__cell--num" role="columnheader">PA</span>
        </div>

        {sorted.map((team, index) => {
          const madePlayoffCut = playoffTeams != null && index < playoffTeams;
          const isCutLine = playoffTeams != null && index === playoffTeams;
          return (
            <div
              className={[
                'standings__row',
                team.isUser ? 'standings__row--you' : '',
                madePlayoffCut ? 'standings__row--playoff' : '',
                isCutLine ? 'standings__row--below-cut' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={team.rosterId}
              role="row"
            >
              <span className="standings__cell standings__cell--rank">{index + 1}</span>
              <span className="standings__cell standings__cell--team">
                {team.avatarUrl ? (
                  <img alt="" className="standings__avatar" src={resolveApiUrl(team.avatarUrl) ?? undefined} />
                ) : (
                  <span className="standings__avatar standings__avatar--blank" aria-hidden="true" />
                )}
                <span className="standings__names">
                  <span className="standings__team-name">
                    {team.teamName}
                    {team.isUser ? <span className="standings__you-tag">you</span> : null}
                  </span>
                  <span className="standings__owner">{team.ownerName}</span>
                </span>
              </span>
              <span className="standings__cell standings__cell--num standings__cell--record">
                {recordLabel(team.record)}
              </span>
              <span className="standings__cell standings__cell--num">{team.pointsFor.toFixed(1)}</span>
              <span className="standings__cell standings__cell--num">{team.pointsAgainst.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      {playoffTeams != null ? (
        <p className="standings__legend">
          Top {playoffTeams} make the playoffs.
        </p>
      ) : null}
    </section>
  );
}
