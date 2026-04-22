import { useMemo, useState } from 'react';
import type { ScoringFormat } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import type { LeagueFutureRow } from '../../mocks/league';
import { Gloss } from '../ui/Gloss';
import './LeagueFutures.css';

interface LeagueFuturesProps {
  futures: LeagueFutureRow[];
  leagueName: string;
  totalTeams: number;
  scoringFormat: ScoringFormat;
  currentWeek: number;
  mode: 'preseason' | 'inseason';
}

type LeagueMarket = 'champion' | 'finals' | 'playoffs';

const MARKET_OPTIONS: { label: string; value: LeagueMarket }[] = [
  { label: 'Champion', value: 'champion' },
  { label: 'Finals', value: 'finals' },
  { label: 'Playoffs', value: 'playoffs' },
];

function formatScoring(scoringFormat: ScoringFormat) {
  return scoringFormat === 'half-ppr' ? 'Half PPR' : scoringFormat.toUpperCase();
}

function impliedProbability(odds: number) {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }

  return 100 / (odds + 100);
}

function getMarketOdds(team: LeagueFutureRow, market: LeagueMarket) {
  switch (market) {
    case 'finals':
      return team.finalsOdds;
    case 'playoffs':
      return team.playoffOdds;
    case 'champion':
    default:
      return team.championOdds;
  }
}

export function LeagueFutures({
  futures,
  leagueName,
  totalTeams,
  scoringFormat,
  currentWeek,
  mode,
}: LeagueFuturesProps) {
  const [market, setMarket] = useState<LeagueMarket>('champion');
  const sortedFutures = useMemo(
    () =>
      [...futures].sort((teamA, teamB) => {
        const teamAProbability = impliedProbability(getMarketOdds(teamA, market));
        const teamBProbability = impliedProbability(getMarketOdds(teamB, market));
        return teamBProbability - teamAProbability;
      }),
    [futures, market],
  );
  const cutoffLabel = market === 'playoffs' ? 'Bubble line' : 'Playoff line';

  return (
    <section aria-labelledby="league-futures-title" className="league-futures">
      <div className="league-futures__header">
        <p className="league-futures__kicker">League futures</p>
        <h2 className="league-futures__title" id="league-futures-title">
          {leagueName}
        </h2>
        <p className="league-futures__meta">
          {totalTeams} teams · <Gloss term="ppr">{formatScoring(scoringFormat)}</Gloss> ·{' '}
          {mode === 'inseason' ? `Week ${currentWeek}` : 'Pre-season market'}
        </p>
      </div>

      <div
        aria-label="League futures market"
        className="league-futures__markets"
        role="group"
      >
        {MARKET_OPTIONS.map((option) => (
          <button
            aria-pressed={market === option.value}
            className={[
              'league-futures__market-option',
              market === option.value ? 'league-futures__market-option--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={option.value}
            onClick={() => setMarket(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="league-futures__board">
        {sortedFutures.map((team, index) => (
          <div className="league-futures__slot" key={team.teamName}>
            {index === 6 ? (
              <div className="league-futures__cutoff" role="presentation">
                <span className="league-futures__cutoff-line" />
                <span className="league-futures__cutoff-label">{cutoffLabel}</span>
                <span className="league-futures__cutoff-line" />
              </div>
            ) : null}

            <article
              className={[
                'league-futures__row',
                team.isUser ? 'league-futures__row--user' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="league-futures__identity">
                <div className="league-futures__team">
                  <span className="league-futures__team-name">{team.teamName}</span>
                  {team.isUser ? <span className="league-futures__you">YOU</span> : null}
                </div>
                <div className="league-futures__context">
                  <span className="league-futures__record">{team.record}</span>
                </div>
              </div>

              <span
                className={[
                  'league-futures__odds',
                  team.isUser ? 'league-futures__odds--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {formatAmericanOdds(getMarketOdds(team, market))}
              </span>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
