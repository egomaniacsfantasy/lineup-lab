import { NO_VALUE, formatAmericanOdds } from '../../utils/formatOdds';
import { spreadLabel, type BoardTeam } from '../../utils/boardSides';
import { pairLineups, type LineupSlotEntry } from '../../utils/matchupLineups.ts';
import { playerShortName, shortInjuryStatus } from '../../utils/playerNames';
import { leagueChartFlags } from '../../config/leagueChartFlags';
import { TeamAvatar } from './TeamAvatar';
import './MatchupDetail.css';

interface MatchupDetailProps {
  left: BoardTeam;
  right: BoardTeam;
  /** The game total, which is one number for the game rather than per side. */
  total?: number;
  leftStarters?: readonly LineupSlotEntry[];
  rightStarters?: readonly LineupSlotEntry[];
  week: number;
}

function pointsText(value: number | null | undefined) {
  return value == null ? NO_VALUE : value.toFixed(1);
}

function percentText(value: number | undefined) {
  return value == null ? NO_VALUE : `${Math.round(value)}%`;
}

/**
 * One game opened up: the market on both sides, then the two starting
 * lineups slot against slot.
 *
 * The board's cards post a price. This is the thing behind the price - the
 * same view the Hub gives you for your own game, given for anyone else's,
 * because "why is that team favoured" is answered by eleven names and eleven
 * numbers and not by a moneyline.
 */
export function MatchupDetail({
  left,
  right,
  total,
  leftStarters,
  rightStarters,
  week,
}: MatchupDetailProps) {
  const rows =
    leftStarters?.length || rightStarters?.length
      ? pairLineups(leftStarters ?? [], rightStarters ?? [])
      : [];

  const sideHead = (side: BoardTeam, align: 'left' | 'right') => (
    <div className={`matchup-detail__side matchup-detail__side--${align}`}>
      <div className="matchup-detail__side-team">
        {leagueChartFlags.avatars ? (
          <TeamAvatar avatarUrl={side.avatarUrl} name={side.name} />
        ) : null}
        <div className="matchup-detail__side-names">
          <span
            className={[
              'matchup-detail__side-name',
              side.isUser ? 'matchup-detail__side-name--user' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {side.name}
          </span>
          <span className="matchup-detail__side-record">{side.record}</span>
        </div>
      </div>

      <dl className="matchup-detail__markets">
        <div className="matchup-detail__market">
          <dt>Spread</dt>
          <dd>{spreadLabel(side.spread) || NO_VALUE}</dd>
        </div>
        <div className="matchup-detail__market">
          <dt>Win</dt>
          <dd>{percentText(side.winProb)}</dd>
        </div>
        <div className="matchup-detail__market">
          <dt>Proj</dt>
          <dd>{pointsText(side.projection)}</dd>
        </div>
        <div className="matchup-detail__market">
          <dt>Price</dt>
          <dd>{formatAmericanOdds(side.odds)}</dd>
        </div>
      </dl>
    </div>
  );

  return (
    <section aria-label={`${left.name} vs ${right.name} detail`} className="matchup-detail">
      <div className="matchup-detail__head">
        {sideHead(left, 'left')}
        <div className="matchup-detail__center">
          <span className="matchup-detail__kicker">Week {week}</span>
          <span aria-hidden="true" className="matchup-detail__at">vs</span>
          {/* The over/under, posted once. It is a number about the game, and
              printing it in both columns would read as two totals. */}
          <span className="matchup-detail__total-label">Total</span>
          <span className="matchup-detail__total">{pointsText(total)}</span>
        </div>
        {sideHead(right, 'right')}
      </div>

      {rows.length > 0 ? (
        <div className="matchup-detail__lineups">
          <div className="matchup-detail__lineup-head" aria-hidden="true">
            <span className="matchup-detail__seat matchup-detail__seat--left">
              <span className="matchup-detail__points">Proj</span>
              <span className="matchup-detail__player">{left.name}</span>
            </span>
            <span className="matchup-detail__slot" />
            <span className="matchup-detail__seat matchup-detail__seat--right">
              <span className="matchup-detail__player">{right.name}</span>
              <span className="matchup-detail__points">Proj</span>
            </span>
          </div>
          {rows.map((row, index) => (
            <div className="matchup-detail__row" key={`${row.slot}-${index}`}>
              <Seat align="left" edge={row.edge === 'left'} entry={row.left} />
              <span className="matchup-detail__slot">{row.slot}</span>
              <Seat align="right" edge={row.edge === 'right'} entry={row.right} />
            </div>
          ))}
        </div>
      ) : (
        <p className="matchup-detail__empty">
          Connect your league to see both lineups here.
        </p>
      )}
    </section>
  );
}

/**
 * One side of one slot: the player and their number, kept together.
 *
 * Together rather than in separate outer columns, because a five-column row
 * cannot hold two names and three fixed columns on a phone without
 * truncating the names - and a truncated player name is the one thing in a
 * lineup that has to survive.
 */
function Seat({
  entry,
  align,
  edge,
}: {
  entry: LineupSlotEntry | null;
  align: 'left' | 'right';
  edge: boolean;
}) {
  const points = (
    <span
      className={['matchup-detail__points', edge ? 'matchup-detail__points--edge' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {pointsText(entry?.projection)}
    </span>
  );

  const player = <PlayerCell align={align} entry={entry} />;

  return (
    <span className={`matchup-detail__seat matchup-detail__seat--${align}`}>
      {align === 'left' ? points : player}
      {align === 'left' ? player : points}
    </span>
  );
}

function PlayerCell({
  entry,
  align,
}: {
  entry: LineupSlotEntry | null;
  align: 'left' | 'right';
}) {
  if (!entry) {
    return <span className={`matchup-detail__player matchup-detail__player--${align}`} />;
  }

  /* The same short forms the Hub's lineup uses. "Marvin Harrison Jr." does
     not fit a half-width column and "Denver Broncos" is DEF beside a team,
     so the row says what every fantasy product's row says. */
  const name =
    entry.playerId == null ? entry.name : playerShortName(entry.name, entry.position);
  const injury = shortInjuryStatus(entry.injuryStatus);
  const meta = [entry.position, entry.team].filter(Boolean).join(' \u00b7 ');

  return (
    <span className={`matchup-detail__player matchup-detail__player--${align}`}>
      <span className="matchup-detail__player-name">{name}</span>
      <span className="matchup-detail__player-meta">
        {meta}
        {injury ? <span className="matchup-detail__injury">{injury}</span> : null}
      </span>
    </span>
  );
}
