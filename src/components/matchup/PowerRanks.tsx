import './PowerRanks.css';

export interface PowerRow {
  rosterId: number;
  teamName: string;
  /** This week's projected points, straight off the priced line. */
  weekProjection: number;
  /** The season sim's projected win total. */
  projWins: number | null;
  isUser: boolean;
}

/**
 * Power rankings, on both clocks at once.
 *
 * A single ranking hides the thing worth knowing. A team can be second this
 * week and eighth for the rest of the season — a good draw on a thin roster —
 * or the reverse, which is a strong roster having a bad week. Those call for
 * opposite behaviour and one number cannot tell them apart, so both are here
 * and the gap between them is drawn rather than left to be worked out.
 *
 * Every value is served: this week's projection comes off the priced line for
 * each team, and the projected win total comes from the season sim. Ranking is
 * sorting, and the arrow is a subtraction of two ranks.
 */
export function PowerRanks({ rows }: { rows: PowerRow[] }) {
  if (rows.length < 3) return null;

  const byWeek = [...rows].sort((a, b) => b.weekProjection - a.weekProjection);
  const weekRank = new Map(byWeek.map((row, index) => [row.rosterId, index + 1]));

  const ranked = [...rows]
    .filter((row) => row.projWins != null)
    .sort((a, b) => (b.projWins ?? 0) - (a.projWins ?? 0));
  if (ranked.length < 3) return null;

  const top = ranked[0].projWins ?? 1;

  return (
    <section className="matchup-page__module power">
      <div className="power__head">
        <span className="power__head-label">Power</span>
        <span className="power__head-cols">
          <span>Wk</span>
          <span>ROS</span>
        </span>
      </div>

      <ol className="power__list">
        {ranked.map((row, index) => {
          const rosRank = index + 1;
          const wk = weekRank.get(row.rosterId) ?? rosRank;
          /* Positive means they are doing better this week than their roster
             says they should over the rest of the way. */
          const swing = rosRank - wk;
          return (
            <li
              className={['power__row', row.isUser ? 'power__row--you' : ''].filter(Boolean).join(' ')}
              key={row.rosterId}
            >
              <span className="power__rank">{rosRank}</span>
              <span className="power__team">{row.teamName}</span>
              <span className="power__meter" aria-hidden="true">
                <span
                  className="power__fill"
                  style={{ width: `${Math.max(6, ((row.projWins ?? 0) / top) * 100)}%` }}
                />
              </span>
              <span className="power__wk">
                {wk}
                {swing !== 0 ? (
                  <span className={`power__swing power__swing--${swing > 0 ? 'up' : 'down'}`}>
                    {swing > 0 ? '▲' : '▼'}{Math.abs(swing)}
                  </span>
                ) : null}
              </span>
              <span className="power__ros">{(row.projWins ?? 0).toFixed(1)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
