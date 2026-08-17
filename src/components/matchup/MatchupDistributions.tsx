import { useId, useState } from 'react';
import type { DensityHistogram, MatchupHistograms } from '../../types/matchup';
import './MatchupDistributions.css';

function peakDensity(h: DensityHistogram): number {
  return h.bins.reduce((m, b) => Math.max(m, b.density), 0) || 1;
}

/**
 * The margin distribution, drawn as the module's one real chart: red where you
 * lose, green where you win, split at zero. The axis is labelled with what the
 * two sides MEAN rather than with the extreme margins of the sample, because
 * the tails of a 5,000-run sample are the least useful thing on the page.
 */
function MarginChart({ histogram, label }: { histogram: DensityHistogram; label: string }) {
  const W = 300;
  const H = 104;
  const padT = 6;
  const padB = 10;
  const { min, max, bins } = histogram;
  const span = max - min || 1;
  const peak = peakDensity(histogram);
  const baseY = H - padB;
  const xOf = (x: number) => ((x - min) / span) * W;
  const yOf = (d: number) => padT + (baseY - padT) * (1 - d / peak);
  const barW = W / bins.length;
  const uid = useId();

  /* Colour is split by clipping the bars at zero rather than by colouring each
     bar from its bin centre. One bin always straddles zero, and colouring that
     whole bar one way paints a slice of winning margin as a loss (or the
     reverse) by up to half a bin. This chart's only claim is "red is where you
     lose, green is where you win", so the split has to land on zero exactly. */
  const zeroX = Math.min(W, Math.max(0, xOf(0)));
  const bars = (fill: string) =>
    bins.map((b, i) => {
      const y = yOf(b.density);
      return (
        <rect
          key={i}
          x={xOf(b.x) - barW / 2}
          y={y}
          width={Math.max(0.6, barW - 0.6)}
          height={Math.max(0, baseY - y)}
          fill={fill}
        />
      );
    });

  return (
    <div className="mhist">
      <svg
        className="mhist__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <defs>
          <clipPath id={`${uid}-loss`}>
            <rect x={0} y={0} width={zeroX} height={H} />
          </clipPath>
          <clipPath id={`${uid}-win`}>
            <rect x={zeroX} y={0} width={W - zeroX} height={H} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-loss)`}>{bars('var(--mhist-loss)')}</g>
        <g clipPath={`url(#${uid}-win)`}>{bars('var(--mhist-win)')}</g>
        <line
          x1={zeroX}
          x2={zeroX}
          y1={padT}
          y2={baseY}
          className="mhist__marker mhist__marker--zero"
        />
        <line x1={0} x2={W} y1={baseY} y2={baseY} className="mhist__axis" />
      </svg>
      <div className="mhist__ends">
        <span className="mhist__end mhist__end--loss">you lose</span>
        <span className="mhist__end mhist__end--win">you win</span>
      </div>
    </div>
  );
}

/**
 * A score distribution demoted to one compact ribbon. It keeps what these
 * charts are for (how high and how low each side can realistically land)
 * without giving a second and third histogram the weight of the first.
 */
function ScoreRibbon({
  histogram,
  label,
}: {
  histogram: DensityHistogram;
  label: string;
}) {
  const W = 300;
  const H = 26;
  const { min, max, mean, bins } = histogram;
  const span = max - min || 1;
  const peak = peakDensity(histogram);
  const xOf = (x: number) => ((x - min) / span) * W;
  const yOf = (d: number) => H * (1 - d / peak);
  const barW = W / bins.length;

  return (
    <div className="mhist-ribbon">
      <div className="mhist-ribbon__head">
        <span className="mhist-ribbon__label">{label}</span>
        <span className="mhist-ribbon__mean">{mean.toFixed(1)} on average</span>
      </div>
      <svg
        className="mhist-ribbon__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, ${mean.toFixed(1)} on average`}
      >
        {bins.map((b, i) => {
          const y = yOf(b.density);
          return (
            <rect
              key={i}
              x={xOf(b.x) - barW / 2}
              y={y}
              width={Math.max(0.6, barW - 0.6)}
              height={Math.max(0, H - y)}
              fill="var(--mhist-bar)"
            />
          );
        })}
        <line
          x1={xOf(mean)}
          x2={xOf(mean)}
          y1={0}
          y2={H}
          className="mhist__marker mhist__marker--mean"
        />
      </svg>
      <div className="mhist-ribbon__ends">
        <span>{min.toFixed(0)}</span>
        <span>{max.toFixed(0)}</span>
      </div>
    </div>
  );
}

/**
 * The three matchup distributions (margin, your points, opponent points) from
 * the same seeded sim that produces the displayed win %.
 *
 * Every number here is read straight off the payload: the headline count is the
 * served win probability stated out of 100, and the average margin and the two
 * ribbon averages are the served `mean` of each histogram, rounded. Nothing on
 * this surface is computed in the frontend.
 */
export function MatchupDistributions({ histograms }: { histograms: MatchupHistograms }) {
  // Exact win% from the recentered samples — identical to the matchup line.
  const winProb = histograms.winProb;
  const winsPerHundred = Math.round(winProb * 100);

  /* On a phone this is the tallest module in the column and the least
     actionable, so it starts collapsed there. The detail is ALWAYS rendered
     and the collapse is done in CSS, scoped to the phone breakpoint: a first
     pass gated the content on this state and hid the toggle on desktop, which
     left the charts unreachable at desktop width. State can no longer
     disagree with the breakpoint. */
  const [open, setOpen] = useState(false);
  const avgMargin = histograms.margin.mean;
  const marginSize = Math.abs(avgMargin).toFixed(1);
  const averageLine = Number(marginSize) === 0
    ? 'On average it is a dead heat.'
    : avgMargin > 0
      ? `On average you win by ${marginSize}.`
      : `On average you lose by ${marginSize}.`;

  return (
    <div className="mhist-group">
      <h2 className="mhist-group__title">How this week could go</h2>

      <p className="mhist-group__headline">
        You win <strong className="mhist-group__count">{winsPerHundred}</strong> times out of 100.
      </p>
      <p className="mhist-group__average">{averageLine}</p>

      <button
        aria-expanded={open}
        className="mhist-group__toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {open ? 'Hide the detail' : 'Show how the week spreads out'}
      </button>

      <div
        className={[
          'mhist-group__detail',
          open ? '' : 'mhist-group__detail--collapsed',
        ].filter(Boolean).join(' ')}
      >
      <MarginChart
        histogram={histograms.margin}
        label={`How much you win or lose by. You win ${winsPerHundred} times out of 100.`}
      />

      <div className="mhist-group__ribbons">
        <ScoreRibbon histogram={histograms.you} label="Your score" />
        <ScoreRibbon histogram={histograms.opponent} label="Opponent score" />
      </div>

      <p className="mhist-group__note">
        From {histograms.sims.toLocaleString()} simulations of this week.
      </p>
      </div>
    </div>
  );
}
