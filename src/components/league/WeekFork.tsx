import './WeekFork.css';

export interface ForkRow {
  rosterId: string;
  teamName: string;
  isUser: boolean;
  nowProb: number;
  winProb: number;
  lossProb: number;
  /** 0-100 for the matchup this side belongs to. */
  importance: number;
  opponentName: string;
}

/**
 * What this week is worth, one team at a time.
 *
 * Every other surface in the product answers "where do you stand". This one
 * answers "what is on the line", which is a different and more urgent
 * question, and it is the one a weekly board should be able to answer at a
 * glance.
 *
 * Each row is a track from the worst outcome to the best. The two ticks are
 * the two branches — where a loss puts you, where a win puts you — and the
 * span between them is the point of the whole graphic: a wide bar means this
 * game decides something, a narrow one means it does not, and you can see
 * which is which without reading a single number.
 *
 * The marker between them is where the team stands right now, with nothing
 * forced. It sits between the branches because it is the probability-weighted
 * blend of them, which is also why it is drawn as a line rather than a third
 * tick: it is not an outcome, it is the price of the two.
 *
 * Draws nothing at all without a conditioned sim behind it. A fork with
 * invented branches is worse than no fork, because the width of that bar reads
 * as a claim about how much a week matters.
 */
export function WeekFork({
  rows,
  week,
  unavailableMessage,
}: {
  rows: ForkRow[];
  week: number | null;
  unavailableMessage?: string;
}) {
  if (unavailableMessage) {
    return (
      <section className="week-fork week-fork--empty">
        <p className="week-fork__kicker">What this week is worth</p>
        <p className="week-fork__unavailable">{unavailableMessage}</p>
      </section>
    );
  }

  if (rows.length === 0) return null;

  /* One scale for every row, so bar widths are comparable down the column.
     Scaling each row to its own range would make a team with nothing at stake
     look exactly like a team whose season is on the line. */
  const lowest = Math.min(...rows.map((row) => Math.min(row.lossProb, row.winProb, row.nowProb)));
  const highest = Math.max(...rows.map((row) => Math.max(row.lossProb, row.winProb, row.nowProb)));
  const floor = Math.max(0, Math.floor((lowest - 4) / 5) * 5);
  const ceiling = Math.min(100, Math.ceil((highest + 4) / 5) * 5);
  const span = Math.max(1, ceiling - floor);
  const pct = (value: number) => ((value - floor) / span) * 100;

  const ordered = [...rows].sort(
    (a, b) => Math.abs(b.winProb - b.lossProb) - Math.abs(a.winProb - a.lossProb),
  );

  return (
    <section aria-labelledby="week-fork-title" className="week-fork">
      <header className="week-fork__head">
        <div>
          <p className="week-fork__kicker">What this week is worth</p>
          <h2 className="week-fork__title" id="week-fork-title">
            Playoff odds, win or lose{week != null ? ` · Week ${week}` : ''}
          </h2>
        </div>
        <p className="week-fork__legend">
          <span className="week-fork__legend-item week-fork__legend-item--loss">Loss</span>
          <span className="week-fork__legend-item week-fork__legend-item--now">Now</span>
          <span className="week-fork__legend-item week-fork__legend-item--win">Win</span>
        </p>
      </header>

      <div className="week-fork__rows">
        {ordered.map((row) => {
          const low = Math.min(row.winProb, row.lossProb);
          const high = Math.max(row.winProb, row.lossProb);
          const swing = high - low;

          return (
            <div
              className={['week-fork__row', row.isUser ? 'week-fork__row--you' : '']
                .filter(Boolean)
                .join(' ')}
              key={row.rosterId}
            >
              <span className="week-fork__team">
                <span className="week-fork__team-name">{row.teamName}</span>
                <span className="week-fork__team-opp">vs {row.opponentName}</span>
              </span>

              <span className="week-fork__track">
                {/* The span between the two branches. Its width IS the story. */}
                <span
                  className="week-fork__span"
                  style={{ left: `${pct(low)}%`, width: `${Math.max(0.6, pct(high) - pct(low))}%` }}
                />
                <span className="week-fork__tick week-fork__tick--loss" style={{ left: `${pct(row.lossProb)}%` }} />
                <span className="week-fork__tick week-fork__tick--win" style={{ left: `${pct(row.winProb)}%` }} />
                <span className="week-fork__now" style={{ left: `${pct(row.nowProb)}%` }} />
              </span>

              <span className="week-fork__numbers">
                <span className="week-fork__num week-fork__num--loss">{row.lossProb.toFixed(0)}%</span>
                <span className="week-fork__num week-fork__num--now">{row.nowProb.toFixed(0)}%</span>
                <span className="week-fork__num week-fork__num--win">{row.winProb.toFixed(0)}%</span>
              </span>

              {/* Percentage points of playoff probability riding on one game. */}
              <span className="week-fork__swing">{swing.toFixed(0)}</span>
            </div>
          );
        })}
      </div>

      <p className="week-fork__foot">
        The bar spans where a loss and a win leave each team&apos;s playoff odds.
        Wider means more is riding on it. The last column is the gap, in
        percentage points.
      </p>
    </section>
  );
}
