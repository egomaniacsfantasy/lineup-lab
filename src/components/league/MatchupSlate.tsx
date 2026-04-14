import { formatAmericanOdds } from '../../utils/formatOdds';
import type { LeagueWeekMatchup } from '../../mocks/league';
import './MatchupSlate.css';

interface MatchupSlateProps {
  matchups: LeagueWeekMatchup[];
  currentWeek: number;
}

function impliedProbability(odds: number) {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  return 100 / (odds + 100);
}

export function MatchupSlate({ matchups, currentWeek }: MatchupSlateProps) {
  return (
    <section aria-labelledby="matchup-slate-title" className="matchup-slate">
      <div className="matchup-slate__header">
        <p className="matchup-slate__kicker">Week {currentWeek} matchups</p>
        <h2 className="matchup-slate__title" id="matchup-slate-title">
          Every game on your league board, priced
        </h2>
      </div>

      <div className="matchup-slate__rows">
        {matchups.map((matchup) => {
          const aProb = impliedProbability(matchup.teamAOdds);
          const bProb = impliedProbability(matchup.teamBOdds);
          const leftTeam =
            aProb >= bProb
              ? {
                  name: matchup.teamA,
                  record: matchup.teamARecord,
                  odds: matchup.teamAOdds,
                }
              : {
                  name: matchup.teamB,
                  record: matchup.teamBRecord,
                  odds: matchup.teamBOdds,
                };
          const rightTeam =
            aProb >= bProb
              ? {
                  name: matchup.teamB,
                  record: matchup.teamBRecord,
                  odds: matchup.teamBOdds,
                }
              : {
                  name: matchup.teamA,
                  record: matchup.teamARecord,
                  odds: matchup.teamAOdds,
                };

          return (
            <article
              className={[
                'matchup-slate__row',
                matchup.isUserGame ? 'matchup-slate__row--user' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={`${matchup.teamA}-${matchup.teamB}`}
            >
              <div className="matchup-slate__team matchup-slate__team--left">
                <span className="matchup-slate__team-name">{leftTeam.name}</span>
                <span className="matchup-slate__record">({leftTeam.record})</span>
              </div>

              <div className="matchup-slate__market">
                <span className="matchup-slate__odds">
                  {formatAmericanOdds(leftTeam.odds)}
                </span>
                <span className="matchup-slate__vs">vs</span>
                <span className="matchup-slate__odds">
                  {formatAmericanOdds(rightTeam.odds)}
                </span>
              </div>

              <div className="matchup-slate__team matchup-slate__team--right">
                <span className="matchup-slate__team-name">{rightTeam.name}</span>
                <span className="matchup-slate__record">({rightTeam.record})</span>
              </div>

              {matchup.isUserGame ? (
                <span className="matchup-slate__tag">Your game</span>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
