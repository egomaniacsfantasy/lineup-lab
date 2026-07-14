interface OddsChartPoint {
  x: number;
  y: number;
  title?: string;
}

interface OddsChartSeries {
  id: string;
  className: string;
  points: OddsChartPoint[];
  dotClassName?: string;
  dotRadius?: number;
}

interface OddsChartBand {
  id: string;
  className: string;
  points: OddsChartPoint[];
}

interface OddsChartReferenceLine {
  id: string;
  className: string;
  value: number;
}

interface OddsChartProps {
  ariaLabel?: string;
  svgClassName?: string;
  gridLineClassName?: string;
  series: OddsChartSeries[];
  yTicks?: number[];
  bands?: OddsChartBand[];
  referenceLines?: OddsChartReferenceLine[];
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

function chartBounds(
  series: OddsChartSeries[],
  bands: OddsChartBand[],
  yTicks: number[],
  referenceLines: OddsChartReferenceLine[],
  minX?: number,
  maxX?: number,
  minY?: number,
  maxY?: number,
) {
  const xValues = [
    ...series.flatMap((entry) => entry.points.map((point) => point.x)),
    ...bands.flatMap((entry) => entry.points.map((point) => point.x)),
  ];
  const yValues = [
    ...series.flatMap((entry) => entry.points.map((point) => point.y)),
    ...bands.flatMap((entry) => entry.points.map((point) => point.y)),
    ...yTicks,
    ...referenceLines.map((entry) => entry.value),
  ];
  const resolvedMinX = minX ?? Math.min(...xValues);
  const resolvedMaxX = maxX ?? Math.max(...xValues);
  const resolvedMinY = minY ?? Math.min(...yValues);
  const resolvedMaxY = maxY ?? Math.max(...yValues);
  return {
    minX: Number.isFinite(resolvedMinX) ? resolvedMinX : 0,
    maxX: Number.isFinite(resolvedMaxX) ? resolvedMaxX : 1,
    minY: Number.isFinite(resolvedMinY) ? resolvedMinY : 0,
    maxY: Number.isFinite(resolvedMaxY) ? resolvedMaxY : 1,
  };
}

function xCoord(value: number, bounds: ReturnType<typeof chartBounds>) {
  const span = Math.max(1, bounds.maxX - bounds.minX);
  return ((value - bounds.minX) / span) * 100;
}

function yCoord(value: number, bounds: ReturnType<typeof chartBounds>) {
  const span = Math.max(1, bounds.maxY - bounds.minY);
  return 100 - ((value - bounds.minY) / span) * 100;
}

function pointString(points: OddsChartPoint[], bounds: ReturnType<typeof chartBounds>) {
  return points
    .map((point) => `${xCoord(point.x, bounds).toFixed(1)},${yCoord(point.y, bounds).toFixed(1)}`)
    .join(' ');
}

export function OddsChart({
  ariaLabel,
  svgClassName,
  gridLineClassName,
  series,
  yTicks = [],
  bands = [],
  referenceLines = [],
  minX,
  maxX,
  minY,
  maxY,
}: OddsChartProps) {
  const bounds = chartBounds(series, bands, yTicks, referenceLines, minX, maxX, minY, maxY);

  return (
    <svg
      aria-label={ariaLabel}
      className={svgClassName}
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {yTicks.map((tick) => (
        <line
          className={gridLineClassName}
          key={`grid-${tick}`}
          x1="0"
          x2="100"
          y1={yCoord(tick, bounds)}
          y2={yCoord(tick, bounds)}
        />
      ))}
      {referenceLines.map((line) => (
        <line
          className={line.className}
          key={line.id}
          x1="0"
          x2="100"
          y1={yCoord(line.value, bounds)}
          y2={yCoord(line.value, bounds)}
        />
      ))}
      {bands.map((band) => (
        <polygon className={band.className} key={band.id} points={pointString(band.points, bounds)} />
      ))}
      {series.map((entry) => (
        <g key={entry.id}>
          <polyline className={entry.className} points={pointString(entry.points, bounds)} />
          {entry.dotClassName
            ? entry.points.map((point) => (
                <circle
                  className={entry.dotClassName}
                  cx={xCoord(point.x, bounds)}
                  cy={yCoord(point.y, bounds)}
                  key={`${entry.id}-${point.x}-${point.y}`}
                  r={entry.dotRadius ?? 1.8}
                >
                  {point.title ? <title>{point.title}</title> : null}
                </circle>
              ))
            : null}
        </g>
      ))}
    </svg>
  );
}
