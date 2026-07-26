import type { DensityHistogram, MatchupHistograms } from '../../types/matchup';
import './MatchupDistributions.css';

function peakDensity(h: DensityHistogram): number {
  return h.bins.reduce((m, b) => Math.max(m, b.density), 0) || 1;
}

/** One density histogram drawn as SVG bars, scaled to its own peak. */
function DensityChart({
  histogram,
  title,
  subtitle,
  colorFor,
  zeroLine = false,
  meanLine = false,
  fmt = (v: number) => v.toFixed(0),
}: {
  histogram: DensityHistogram;
  title: string;
  subtitle?: string;
  colorFor?: (x: number) => string;
  zeroLine?: boolean;
  meanLine?: boolean;
  fmt?: (v: number) => string;
}) {
  const W = 300;
  const H = 110;
  const padT = 6;
  const padB = 16;
  const { min, max, mean, bins } = histogram;
  const span = max - min || 1;
  const peak = peakDensity(histogram);
  const baseY = H - padB;
  const xOf = (x: number) => ((x - min) / span) * W;
  const yOf = (d: number) => padT + (baseY - padT) * (1 - d / peak);
  const barW = W / bins.length;

  return (
    <div className="mhist">
      <div className="mhist__head">
        <span className="mhist__title">{title}</span>
        {subtitle ? <span className="mhist__sub">{subtitle}</span> : null}
      </div>
      <svg className="mhist__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
        {bins.map((b, i) => {
          const y = yOf(b.density);
          return (
            <rect
              key={i}
              x={xOf(b.x) - barW / 2}
              y={y}
              width={Math.max(0.6, barW - 0.6)}
              height={Math.max(0, baseY - y)}
              fill={colorFor ? colorFor(b.x) : 'var(--mhist-bar)'}
            />
          );
        })}
        {zeroLine ? <line x1={xOf(0)} x2={xOf(0)} y1={padT} y2={baseY} className="mhist__marker mhist__marker--zero" /> : null}
        {meanLine ? <line x1={xOf(mean)} x2={xOf(mean)} y1={padT} y2={baseY} className="mhist__marker mhist__marker--mean" /> : null}
        <line x1={0} x2={W} y1={baseY} y2={baseY} className="mhist__axis" />
      </svg>
      <div className="mhist__labels">
        <span>{fmt(min)}</span>
        <span>{fmt((min + max) / 2)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

/**
 * The three matchup distributions (margin, your points, opponent points) from
 * the same seeded sim that produces the displayed win %.
 */
export function MatchupDistributions({ histograms }: { histograms: MatchupHistograms }) {
  // Exact win% from the recentered samples — identical to the matchup line.
  const winProb = histograms.winProb;

  return (
    <div className="mhist-group">
      <div className="mhist-group__head">
        <h3 className="mhist-group__title">Simulated outcomes</h3>
        <span className="mhist-group__runs">{histograms.sims.toLocaleString()} runs</span>
      </div>
      <DensityChart
        histogram={histograms.margin}
        title="Margin (you − opponent)"
        subtitle={`${Math.round(winProb * 100)}% to win`}
        zeroLine
        colorFor={(x) => (x >= 0 ? 'var(--mhist-win)' : 'var(--mhist-loss)')}
        fmt={(v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0))}
      />
      <DensityChart
        histogram={histograms.you}
        title="Your points"
        subtitle={`avg ${histograms.you.mean.toFixed(1)}`}
        meanLine
      />
      <DensityChart
        histogram={histograms.opponent}
        title="Opponent points"
        subtitle={`avg ${histograms.opponent.mean.toFixed(1)}`}
        meanLine
      />
    </div>
  );
}
