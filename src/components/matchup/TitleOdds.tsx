import { formatAmericanOdds } from '../../utils/formatOdds';
import { isMaterialMove } from '../../utils/leagueMovement';
import './TitleOdds.css';

export interface TitleRow {
  rosterId: number;
  teamName: string;
  /** Chance of winning it all, straight off the season sim. */
  titleProb: number;
  championOdds: number;
  isUser: boolean;
  /** Points of title chance gained or lost since the board opened. Null when
      there is no history yet, which is every league in week 1. */
  move: number | null;
}

/**
 * The league's title market, condensed.
 *
 * This replaces the power rankings that used to sit here. Power rankings were
 * a derived opinion about who is good; this is the price, which is the thing
 * the product actually sells and the same number the League tab quotes. Rank
 * is sorting, the bar is the field's shape at a glance, and the move is a
 * subtraction against the opening board. Nothing here is computed: every value
 * is served by the season sim.
 */
export function TitleOdds({ rows }: { rows: TitleRow[] }) {
  const ranked = [...rows]
    .filter((row) => Number.isFinite(row.titleProb))
    .sort((a, b) => b.titleProb - a.titleProb);
  if (ranked.length < 3) return null;

  /* Scaled against the favourite rather than against 100%, because in a
     twelve-team league nobody is above about a quarter and a bar drawn to
     100% would leave every row looking identically hopeless. */
  const top = ranked[0].titleProb || 1;

  /* Week one has no history, so every move is null and the column is a header
     over five empty cells. A column that never has a value in it is not a
     quiet column, it is a broken one. */
  const hasMovement = ranked.some((row) => row.move != null && isMaterialMove(row.move));

  return (
    <section
      className={['matchup-page__module title-odds', hasMovement ? '' : 'title-odds--still']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="title-odds__head">
        <span className="title-odds__head-label">Title odds</span>
        <span className="title-odds__head-cols">
          <span>Price</span>
          {hasMovement ? <span>Move</span> : null}
        </span>
      </div>

      <ol className="title-odds__list">
        {ranked.map((row, index) => (
          <li
            className={['title-odds__row', row.isUser ? 'title-odds__row--you' : '']
              .filter(Boolean)
              .join(' ')}
            key={row.rosterId}
          >
            <span className="title-odds__rank">{index + 1}</span>
            <span className="title-odds__team">{row.teamName}</span>
            <span className="title-odds__meter" aria-hidden="true">
              <span
                className="title-odds__fill"
                style={{ width: `${Math.max(4, (row.titleProb / top) * 100)}%` }}
              />
            </span>
            {/* The price is the product, so it is the loudest thing in the
                row: a quoted number in a box, the way a book posts one. */}
            <span className="title-odds__price">{formatAmericanOdds(row.championOdds)}</span>
            {hasMovement ? (
              <span className="title-odds__move">
                {/* Per row, on the same threshold the League tab uses, so the
                    two never disagree about whether something happened. */}
                {row.move != null && isMaterialMove(row.move) ? (
                  <span
                    className={`title-odds__swing title-odds__swing--${row.move > 0 ? 'up' : 'down'}`}
                  >
                    {row.move > 0 ? '▲' : '▼'}
                    {Math.abs(row.move).toFixed(1)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
