import type { WeeklyTrajectoryPoint } from '../../mocks/season';
import type { CascadeImpact } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import './CascadePanel.css';

interface CascadePanelProps {
  trajectory: WeeklyTrajectoryPoint[];
  scenarios: CascadeImpact[];
  activeScenarioLabel: string;
}

function buildTicks(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const steps = 3;
  const interval = Math.max(25, Math.round((max - min) / steps / 10) * 10 || 50);
  const start = Math.ceil(max / interval) * interval;
  const end = Math.floor(min / interval) * interval;
  const ticks: number[] = [];

  for (let value = start; value >= end; value -= interval) {
    ticks.push(value);
  }

  return ticks.length > 1 ? ticks : [start, start - interval, start - interval * 2];
}

function formatSignedDelta(value: number, suffix = '%') {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;
}

export function CascadePanel({
  trajectory,
  scenarios,
  activeScenarioLabel,
}: CascadePanelProps) {
  const activeScenario =
    scenarios.find((scenario) => scenario.scenarioLabel === activeScenarioLabel) ??
    scenarios[0];
  const allOdds = trajectory.map((point) => point.championshipOdds);
  const minOdds = Math.min(...allOdds);
  const maxOdds = Math.max(...allOdds);
  const chartWidth = 340;
  const chartHeight = 110;
  const paddingLeft = 36;
  const paddingRight = 4;
  const paddingTop = 14;
  const paddingBottom = 20;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const getX = (index: number) =>
    paddingLeft + (plotWidth / Math.max(trajectory.length - 1, 1)) * index;
  const getY = (value: number) =>
    paddingTop + ((maxOdds - value) / Math.max(maxOdds - minOdds, 1)) * plotHeight;

  const linePath = trajectory
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${getX(index)} ${getY(point.championshipOdds)}`)
    .join(' ');
  const ticks = buildTicks(allOdds);
  const currentPoint = trajectory[trajectory.length - 1];
  const xLabelWeeks = new Set([trajectory[0]?.week, trajectory[3]?.week, currentPoint.week]);

  return (
    <section aria-labelledby="cascade-panel-title" className="cascade-panel">
      <div className="cascade-panel__header">
        <h2 className="cascade-panel__title" id="cascade-panel-title">
          Title price, week by week
        </h2>
      </div>

      <div className="cascade-panel__chart-card">
        <div className="cascade-panel__chart-meta">
          <div>
            <p className="cascade-panel__chart-value">
              {formatAmericanOdds(currentPoint.championshipOdds)}
            </p>
            <p className="cascade-panel__chart-label">
              opened {formatAmericanOdds(trajectory[0].championshipOdds)}
            </p>
          </div>
          <p className="cascade-panel__chart-note">Week {currentPoint.week}</p>
        </div>

        <svg
          aria-label="Season trajectory chart"
          className="cascade-panel__chart"
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          {ticks.map((tick) => {
            const y = getY(tick);

            return (
              <g key={tick}>
                <line
                  className="cascade-panel__grid-line"
                  x1={paddingLeft}
                  x2={chartWidth - paddingRight}
                  y1={y}
                  y2={y}
                />
                <text
                  className="cascade-panel__axis-label"
                  x={paddingLeft - 8}
                  y={y + 4}
                >
                  {formatAmericanOdds(tick)}
                </text>
              </g>
            );
          })}

          <path className="cascade-panel__line" d={linePath} />

          {trajectory.map((point, index) => {
            const isCurrent = index === trajectory.length - 1;

            return (
              <g key={point.week}>
                {isCurrent ? (
                  <circle
                    className="cascade-panel__point cascade-panel__point--current"
                    cx={getX(index)}
                    cy={getY(point.championshipOdds)}
                    r={4}
                  />
                ) : null}
                {xLabelWeeks.has(point.week) ? (
                  <text
                    className="cascade-panel__axis-label"
                    x={getX(index)}
                    y={chartHeight - 4}
                    textAnchor="middle"
                  >
                    W{point.week}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {activeScenario ? (
        <div className="cascade-panel__summary">
          <div className="cascade-panel__summary-head">
            <p className="cascade-panel__summary-kicker">This week's pivot</p>
            <p className="cascade-panel__summary-title">{activeScenario.scenarioLabel}</p>
          </div>

          <div className="cascade-panel__summary-metrics">
            <div className="cascade-panel__summary-metric">
              <span className="cascade-panel__summary-label">This week</span>
              <span className="cascade-panel__summary-value">
                {activeScenario.weeklyWinProb.toFixed(1)}%
              </span>
            </div>

            <div className="cascade-panel__summary-metric">
              <span className="cascade-panel__summary-label">Playoffs</span>
              <span className="cascade-panel__summary-value">
                {activeScenario.playoffProb.toFixed(1)}%
              </span>
              <span
                className={[
                  'cascade-panel__summary-delta',
                  activeScenario.playoffDelta > 0
                    ? 'cascade-panel__summary-delta--positive'
                    : activeScenario.playoffDelta < 0
                      ? 'cascade-panel__summary-delta--negative'
                      : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {activeScenario.playoffDelta === 0
                  ? 'baseline'
                  : formatSignedDelta(activeScenario.playoffDelta)}
              </span>
            </div>

            <div className="cascade-panel__summary-metric">
              <span className="cascade-panel__summary-label">Title</span>
              <span className="cascade-panel__summary-value">
                {formatAmericanOdds(activeScenario.championshipOdds)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
