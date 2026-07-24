import { Navigate, useParams } from 'react-router-dom';
import { OddsChart, type OddsChartPoint } from '../components/charts/OddsChart';
import './DesignChartPage.css';

type DesignChartVariant = 'pace-negative' | 'pace-positive';

function isVariant(value: string | undefined): value is DesignChartVariant {
  return value === 'pace-negative' || value === 'pace-positive';
}

const NEGATIVE_POINTS: OddsChartPoint[] = [
  { x: 1, y: -1.4 },
  { x: 2, y: -1.5 },
  { x: 3, y: -1.3 },
  { x: 4, y: -1.2 },
  { x: 5, y: -1.1 },
];

const POSITIVE_POINTS: OddsChartPoint[] = [
  { x: 1, y: 1.2 },
  { x: 2, y: 1.4 },
  { x: 3, y: 1.1 },
  { x: 4, y: 1.3 },
  { x: 5, y: 1.5 },
];

function paceValue(delta: number) {
  const rounded = Math.abs(delta) < 0.05 ? 0 : Number(delta.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function paceDeltaRead(delta: number, rangeLabel: string) {
  const rounded = Math.abs(delta) < 0.05 ? 0 : Number(delta.toFixed(1));
  return {
    text: `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} wins this ${rangeLabel.toLowerCase()}`,
    tone: rounded > 0 ? 'positive' : rounded < 0 ? 'negative' : 'neutral',
  } as const;
}

function paceSummary(openValue: number, currentValue: number) {
  return `Open ${paceValue(openValue)} → Now ${paceValue(currentValue)}`;
}

function weekLabel(value: number) {
  return `Wk ${Math.round(value)}`;
}

function paceYAxis(value: number) {
  const rounded = Math.abs(value) < 0.05 ? 0 : Number(value.toFixed(1));
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

export function DesignChartPage() {
  const { variant } = useParams<{ variant?: string }>();

  if (!isVariant(variant)) {
    return <Navigate replace to="/design/chart/pace-negative" />;
  }

  const points = variant === 'pace-negative' ? NEGATIVE_POINTS : POSITIVE_POINTS;

  return (
    <div className="design-chart-page">
      <div className="design-chart-page__card">
        <p className="design-chart-page__eyebrow">Design chart fixture: {variant}</p>
        <OddsChart
          caption="Synthetic fill-regression fixture."
          className="design-chart-page__chart design-chart-page__chart--fill-test"
          dateFormatter={weekLabel}
          defaultRangeId="season"
          deltaFormatter={paceDeltaRead}
          displayValueForDelta={(value) => Number(value.toFixed(1))}
          domainMode="delta"
          footer="This fixture hides the hero stroke so fill-only pixel sampling can stay strict."
          hero={{
            id: variant,
            name: 'Against .500 pace',
            points,
          }}
          heroFillMode="zero"
          rangeOptions={[{ id: 'season', label: 'Season' }]}
          showHeroEndpoint={false}
          summaryFormatter={paceSummary}
          title="Expected wins pace"
          valueFormatter={paceValue}
          xTickFormatter={weekLabel}
          yTickFormatter={paceYAxis}
        />
      </div>
    </div>
  );
}
