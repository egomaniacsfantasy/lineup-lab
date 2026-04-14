import type { ConsensusRanking, Position } from '../../types';
import './ConsensusTable.css';

interface ConsensusTableProps {
  rankings: ConsensusRanking[];
}

function getPositionClass(position: Position) {
  switch (position) {
    case 'QB':
      return 'qb';
    case 'RB':
      return 'rb';
    case 'WR':
      return 'wr';
    case 'TE':
      return 'te';
    case 'K':
      return 'k';
    case 'DEF':
      return 'def';
    default:
      return 'wr';
  }
}

export function ConsensusTable({ rankings }: ConsensusTableProps) {
  return (
    <section aria-labelledby="consensus-table-title" className="consensus-table">
      <div className="consensus-table__header">
        <p className="consensus-table__kicker">Consensus redraft rankings</p>
        <h2 className="consensus-table__title" id="consensus-table-title">
          Updated from 142,417 submissions
        </h2>
      </div>

      <div className="consensus-table__table-wrap">
        <table className="consensus-table__table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Pos</th>
              <th>Tier</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((ranking) => (
              <tr key={ranking.player.id}>
                <td className="consensus-table__rank">{ranking.rank}</td>
                <td className="consensus-table__player">
                  <span className="consensus-table__player-name">
                    {ranking.player.shortName}
                  </span>
                  <span className="consensus-table__player-team">
                    {ranking.player.team}
                  </span>
                </td>
                <td>
                  <span
                    className={[
                      'consensus-table__pos',
                      `consensus-table__pos--${getPositionClass(ranking.player.position)}`,
                    ].join(' ')}
                  >
                    {ranking.player.position}
                    {ranking.positionRank}
                  </span>
                </td>
                <td>
                  <span
                    className={[
                      'consensus-table__tier',
                      `consensus-table__tier--${ranking.tier.toLowerCase()}`,
                    ].join(' ')}
                  >
                    {ranking.tier}
                  </span>
                </td>
                <td>
                  <span
                    className={[
                      'consensus-table__trend',
                      ranking.trend === 'up'
                        ? 'consensus-table__trend--up'
                        : ranking.trend === 'down'
                          ? 'consensus-table__trend--down'
                          : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {ranking.trend === 'up'
                      ? `↑ ${ranking.trendDelta}`
                      : ranking.trend === 'down'
                        ? `↓ ${Math.abs(ranking.trendDelta)}`
                        : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
