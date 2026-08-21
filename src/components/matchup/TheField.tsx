import './TheField.css';

export interface FieldTeam {
  rosterId: number;
  teamName: string;
  projection: number;
  isUser: boolean;
  isOpponent: boolean;
}

/**
 * The field this week.
 *
 * A moneyline says you are 39% to win. It does not say why, and two opposite
 * situations produce the same 39%: a roster that is 11th of 12, or a roster
 * that is 3rd of 12 which drew the 1st. One of those means go and get a
 * running back; the other means do nothing, you were unlucky. No fantasy
 * product shows you the field, so nobody can tell which one they are in.
 *
 * The ruler is the point. Fantasy scores swing about a standard deviation of
 * 25 points week to week, and a whole league's projections usually span less
 * than that. Drawing both on one axis shows that the distance between first
 * and last is smaller than the noise — which is the truest and least-said
 * thing about the sport, and exactly how a book reads a spread: the number
 * only means something next to the volatility.
 *
 * Nothing is computed here beyond sorting and subtraction. Every projection
 * and the sigma are served.
 */
export function TheField({
  teams,
  sigma,
  median,
}: {
  teams: FieldTeam[];
  sigma: number;
  median: number;
}) {
  if (teams.length < 2 || sigma <= 0) return null;

  const sorted = [...teams].sort((a, b) => b.projection - a.projection);
  const you = sorted.find((t) => t.isUser) ?? null;
  const opponent = sorted.find((t) => t.isOpponent) ?? null;
  const rank = you ? sorted.indexOf(you) + 1 : null;

  /* The axis is the noise, not the field.
     First attempt scaled a sigma ruler onto an axis sized by the teams, and on
     real data it pinned at 100% and read as a border: six teams spanned 11.1
     points against a sigma of 18.4. That is the whole point — the league is
     closer together than one team's week-to-week swing — so the axis is a
     fixed +/-1.5 sigma around the median team's expected score and the teams
     fall where they fall inside it. They cluster in the middle, and the width
     of that cluster against the width of the axis IS the finding. */
  const HALF = 1.5;
  const min = median - HALF * sigma;
  const max = median + HALF * sigma;
  const at = (value: number) =>
    Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const gap = you && opponent ? you.projection - opponent.projection : null;
  const spread = sorted[0].projection - sorted[sorted.length - 1].projection;

  return (
    <div className="field">
      <div className="field__scale">
        {/* One sigma either side of the median, so the teams have something to
            be narrow against. */}
        <span className="field__band" style={{ left: `${at(median - sigma)}%`, width: `${at(median + sigma) - at(median - sigma)}%` }} />
        <span className="field__median" style={{ left: `${at(median)}%` }} />

        {sorted.map((team) => (
          <span
            className={[
              'field__tick',
              team.isUser ? 'field__tick--you' : '',
              team.isOpponent ? 'field__tick--opponent' : '',
            ].filter(Boolean).join(' ')}
            key={team.rosterId}
            style={{ left: `${at(team.projection)}%` }}
            title={`${team.teamName} · ${team.projection.toFixed(1)}`}
          />
        ))}

        {you ? <span className="field__flag field__flag--you" style={{ left: `${at(you.projection)}%` }}>You</span> : null}
        {opponent ? (
          <span className="field__flag field__flag--opp" style={{ left: `${at(opponent.projection)}%` }}>Opp</span>
        ) : null}
      </div>

      <div className="field__axis">
        <span>−1σ</span>
        <span className="field__axis-mid">league median {median.toFixed(0)}</span>
        <span>+1σ</span>
      </div>

      <div className="field__readout">
        {rank ? (
          <span className="field__stat">
            <span className="field__stat-label">Rank</span>
            <span className="field__stat-value">{rank}/{sorted.length}</span>
          </span>
        ) : null}
        <span className="field__stat">
          <span className="field__stat-label">Field spread</span>
          <span className="field__stat-value">{spread.toFixed(1)}</span>
        </span>
        <span className="field__stat">
          <span className="field__stat-label">1σ noise</span>
          <span className="field__stat-value">{sigma.toFixed(1)}</span>
        </span>
        {gap != null ? (
          <span className="field__stat">
            <span className="field__stat-label">Gap in σ</span>
            <span className="field__stat-value">{(Math.abs(gap) / sigma).toFixed(2)}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
