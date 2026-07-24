import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { TeamAvatar } from '../league/TeamAvatar';
import { displayedDelta } from '../../utils/displayDelta';
import './OddsChart.css';

export interface OddsChartPoint {
  x: number;
  y: number;
  title?: string;
}

export interface OddsChartSeries {
  id: string;
  name: string;
  shortLabel?: string;
  points: OddsChartPoint[];
  avatarUrl?: string | null;
  endpointDetail?: string | null;
}

export interface OddsChartBandPoint {
  x: number;
  low: number;
  high: number;
}

export interface OddsChartBand {
  id: string;
  points: OddsChartBandPoint[];
}

export interface OddsChartRangeOption {
  id: string;
  label: string;
  windowMs?: number;
}

type DeltaTone = 'positive' | 'negative' | 'neutral';

interface OddsChartDeltaRead {
  text: string;
  tone: DeltaTone;
}

interface OddsChartProps {
  title: string;
  caption?: string;
  footer?: ReactNode;
  className?: string;
  hero: OddsChartSeries;
  comparison?: OddsChartSeries | null;
  band?: OddsChartBand | null;
  rangeOptions?: OddsChartRangeOption[];
  defaultRangeId?: string;
  valueFormatter: (value: number) => string;
  deltaFormatter: (delta: number, rangeLabel: string) => OddsChartDeltaRead;
  summaryFormatter: (openValue: number, currentValue: number) => string;
  dateFormatter?: (value: number) => string;
  xTickFormatter?: (value: number) => string;
  yTickFormatter?: (value: number) => string;
  domainMode?: 'probability' | 'delta';
  flatText?: string;
  flatThreshold?: number;
  referenceValue?: number | null;
  showHeroEndpoint?: boolean;
  showComparisonEndpoint?: boolean;
  heroFillMode?: 'floor' | 'zero' | 'none';
  displayValueForDelta?: (value: number) => number;
}

const DEFAULT_RANGES: OddsChartRangeOption[] = [{ id: 'season', label: 'Season' }];
const PLOT = {
  left: 1.5,
  right: 82,
  top: 4,
  bottom: 84,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function chartBounds(
  hero: OddsChartPoint[],
  comparison: OddsChartPoint[],
  band: OddsChartBandPoint[],
  domainMode: OddsChartProps['domainMode'],
  seasonView: boolean,
  referenceValue: number,
) {
  const xValues = hero.map((point) => point.x);
  const minX = xValues[0] ?? 0;
  const maxX = xValues.at(-1) ?? minX + 1;
  const yValues = [
    ...hero.map((point) => point.y),
    ...comparison.map((point) => point.y),
    ...band.flatMap((point) => [point.low, point.high]),
    referenceValue,
  ].filter((value) => Number.isFinite(value));

  if (domainMode === 'delta') {
    const maxAbs = Math.max(1, ...yValues.map((value) => Math.abs(value)));
    const padded = Math.max(1.2, Math.ceil((maxAbs + 0.2) * 10) / 10);
    return { minX, maxX, minY: -padded, maxY: padded };
  }

  if (seasonView) {
    return { minX, maxX, minY: 0, maxY: 100 };
  }

  const rawMin = clamp(Math.min(...yValues) - 5, 0, 100);
  const rawMax = clamp(Math.max(...yValues) + 5, 0, 100);
  let minY = rawMin;
  let maxY = rawMax;

  if (maxY - minY < 12) {
    const midpoint = (minY + maxY) / 2;
    minY = clamp(midpoint - 6, 0, 100);
    maxY = clamp(midpoint + 6, 0, 100);
  }

  const distanceToZero = minY;
  const distanceToHundred = 100 - maxY;
  if (distanceToZero < distanceToHundred) {
    minY = 0;
    maxY = Math.max(12, maxY);
  } else if (distanceToHundred < distanceToZero) {
    maxY = 100;
    minY = Math.min(88, minY);
  }

  if (maxY - minY < 12) {
    if (minY === 0) {
      maxY = 12;
    } else if (maxY === 100) {
      minY = 88;
    } else {
      const midpoint = (minY + maxY) / 2;
      minY = clamp(midpoint - 6, 0, 100);
      maxY = clamp(midpoint + 6, 0, 100);
    }
  }

  return { minX, maxX, minY, maxY };
}

function xCoord(value: number, bounds: ReturnType<typeof chartBounds>) {
  const span = Math.max(1, bounds.maxX - bounds.minX);
  const ratio = (value - bounds.minX) / span;
  return PLOT.left + ratio * (PLOT.right - PLOT.left);
}

function yCoord(value: number, bounds: ReturnType<typeof chartBounds>) {
  const span = Math.max(1, bounds.maxY - bounds.minY);
  const ratio = (value - bounds.minY) / span;
  return PLOT.bottom - ratio * (PLOT.bottom - PLOT.top);
}

function filterPointsForRange(
  points: OddsChartPoint[],
  latestX: number,
  range: OddsChartRangeOption,
) {
  if (range.windowMs == null) return points;
  const cutoff = latestX - range.windowMs;
  const visible = points.filter((point) => point.x >= cutoff);
  if (visible.length === 0) return points.slice(-1);
  const firstVisibleIndex = points.findIndex((point) => point.x >= cutoff);
  if (firstVisibleIndex > 0) {
    return [points[firstVisibleIndex - 1], ...visible];
  }
  return visible;
}

function filterBandForRange(
  points: OddsChartBandPoint[],
  latestX: number,
  range: OddsChartRangeOption,
) {
  if (range.windowMs == null) return points;
  const cutoff = latestX - range.windowMs;
  const visible = points.filter((point) => point.x >= cutoff);
  if (visible.length === 0) return points.slice(-1);
  const firstVisibleIndex = points.findIndex((point) => point.x >= cutoff);
  if (firstVisibleIndex > 0) {
    return [points[firstVisibleIndex - 1], ...visible];
  }
  return visible;
}

function materializedRanges(
  points: OddsChartPoint[],
  requestedRanges: OddsChartRangeOption[] | undefined,
) {
  const latestX = points.at(-1)?.x ?? 0;
  const sourceRanges = requestedRanges?.length ? requestedRanges : DEFAULT_RANGES;
  const eligible = sourceRanges.filter((range) => filterPointsForRange(points, latestX, range).length >= 3);
  return eligible.length > 0 ? eligible : [sourceRanges.at(-1) ?? DEFAULT_RANGES[0]];
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values.map((value) => Number(value.toFixed(3))))].sort((left, right) => left - right);
}

function defaultDateFormatter(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function defaultYAxisFormatter(value: number) {
  if (value > 99) return '>99%';
  if (value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

function defaultXAxisLabels(points: OddsChartPoint[]) {
  if (points.length <= 1) return points;
  const middle = points[Math.floor((points.length - 1) / 2)];
  const set = new Map<number, OddsChartPoint>();
  [points[0], middle, points.at(-1)].forEach((point) => {
    if (point) set.set(point.x, point);
  });
  return [...set.values()];
}

function probabilityTicks(minY: number, maxY: number) {
  const span = Math.max(1, maxY - minY);
  const step = span <= 14 ? 4 : span <= 24 ? 5 : span <= 48 ? 10 : 25;
  const ticks = new Set<number>();
  const start = Math.ceil(minY / step) * step;
  for (let value = start; value <= maxY + 0.001; value += step) {
    ticks.add(value);
  }
  if (minY < 50 && maxY > 50) ticks.add(50);
  if (Math.abs(minY) < 0.001) ticks.add(0);
  if (Math.abs(maxY - 100) < 0.001) ticks.add(100);
  const resolved = uniqueNumbers([...ticks]).filter((value) => value >= minY - 0.001 && value <= maxY + 0.001);
  return resolved.length > 0 ? resolved : uniqueNumbers([minY, maxY]);
}

function deltaTicks(minY: number, maxY: number, referenceValue: number) {
  const span = Math.max(0.2, maxY - minY);
  const step = span <= 2.5 ? 0.5 : span <= 5 ? 1 : span <= 10 ? 2 : 5;
  const ticks = new Set<number>();
  const start = Math.ceil(minY / step) * step;
  for (let value = start; value <= maxY + 0.0001; value += step) {
    ticks.add(Number(value.toFixed(2)));
  }
  ticks.add(referenceValue);
  const resolved = uniqueNumbers([...ticks]).filter((value) => value >= minY - 0.001 && value <= maxY + 0.001);
  return resolved.length > 0 ? resolved : uniqueNumbers([minY, referenceValue, maxY]);
}

function filterTicksBySpacing(
  ticks: number[],
  bounds: ReturnType<typeof chartBounds>,
  preferredAnchor: number,
  minSpacing = 14,
) {
  const prioritized = ticks
    .slice()
    .sort((left, right) => {
      const leftAnchor = Math.abs(left - preferredAnchor);
      const rightAnchor = Math.abs(right - preferredAnchor);
      if (leftAnchor !== rightAnchor) return leftAnchor - rightAnchor;
      return right - left;
    });
  const kept: number[] = [];
  prioritized.forEach((tick) => {
    const y = yCoord(tick, bounds);
    if (kept.every((existing) => Math.abs(yCoord(existing, bounds) - y) >= minSpacing)) {
      kept.push(tick);
    }
  });
  return kept.sort((left, right) => left - right);
}

function stepPoints(points: OddsChartPoint[], bounds: ReturnType<typeof chartBounds>) {
  if (points.length === 0) return [];
  const mapped = [{ x: xCoord(points[0].x, bounds), y: yCoord(points[0].y, bounds) }];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const currentX = xCoord(current.x, bounds);
    mapped.push({ x: currentX, y: yCoord(previous.y, bounds) });
    mapped.push({ x: currentX, y: yCoord(current.y, bounds) });
  }
  const lastPoint = points.at(-1);
  if (lastPoint && lastPoint.x < bounds.maxX) {
    mapped.push({ x: xCoord(bounds.maxX, bounds), y: yCoord(lastPoint.y, bounds) });
  }
  return mapped;
}

function linePath(points: OddsChartPoint[], bounds: ReturnType<typeof chartBounds>) {
  const mapped = stepPoints(points, bounds);
  if (mapped.length === 0) return '';
  return mapped
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function areaPathToBaseline(
  points: OddsChartPoint[],
  bounds: ReturnType<typeof chartBounds>,
  baselineValue: number,
) {
  const mapped = stepPoints(points, bounds);
  if (mapped.length === 0) return '';
  const baselineY = yCoord(baselineValue, bounds);
  const firstX = mapped[0].x;
  const lastX = mapped.at(-1)?.x ?? firstX;
  return [
    `M ${firstX.toFixed(2)} ${baselineY.toFixed(2)}`,
    `L ${firstX.toFixed(2)} ${mapped[0].y.toFixed(2)}`,
    ...mapped
      .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${lastX.toFixed(2)} ${baselineY.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function stepBandPoints(points: OddsChartBandPoint[], bounds: ReturnType<typeof chartBounds>, side: 'low' | 'high') {
  if (points.length === 0) return [];
  const firstValue = side === 'high' ? points[0].high : points[0].low;
  const mapped = [{ x: xCoord(points[0].x, bounds), y: yCoord(firstValue, bounds) }];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousValue = side === 'high' ? previous.high : previous.low;
    const currentValue = side === 'high' ? current.high : current.low;
    const currentX = xCoord(current.x, bounds);
    mapped.push({ x: currentX, y: yCoord(previousValue, bounds) });
    mapped.push({ x: currentX, y: yCoord(currentValue, bounds) });
  }
  const lastPoint = points.at(-1);
  if (lastPoint && lastPoint.x < bounds.maxX) {
    const lastValue = side === 'high' ? lastPoint.high : lastPoint.low;
    mapped.push({ x: xCoord(bounds.maxX, bounds), y: yCoord(lastValue, bounds) });
  }
  return mapped;
}

function bandPath(points: OddsChartBandPoint[], bounds: ReturnType<typeof chartBounds>) {
  const top = stepBandPoints(points, bounds, 'high');
  const bottom = stepBandPoints(points, bounds, 'low').reverse();
  const allPoints = [...top, ...bottom];
  if (allPoints.length === 0) return '';
  return [
    `M ${allPoints[0].x.toFixed(2)} ${allPoints[0].y.toFixed(2)}`,
    ...allPoints.slice(1).map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    'Z',
  ].join(' ');
}

function snapPoint(points: OddsChartPoint[], targetX: number) {
  if (points.length === 0) return null;
  let current = points[0];
  for (const point of points) {
    if (point.x > targetX) break;
    current = point;
  }
  return current;
}

function shortCodeFor(label: string, fallback?: string) {
  if (fallback) return fallback;
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.map((part) => part[0]).join('').slice(0, 4).toUpperCase();
  return label.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
}

export function OddsChart({
  title,
  caption,
  footer = null,
  className = '',
  hero,
  comparison = null,
  band = null,
  rangeOptions,
  defaultRangeId,
  valueFormatter,
  deltaFormatter,
  summaryFormatter,
  dateFormatter = defaultDateFormatter,
  xTickFormatter = defaultDateFormatter,
  yTickFormatter = defaultYAxisFormatter,
  domainMode = 'probability',
  flatText = '0.0 vs open',
  flatThreshold = domainMode === 'probability' ? 1 : 0.15,
  referenceValue = domainMode === 'probability' ? 50 : 0,
  showHeroEndpoint = true,
  showComparisonEndpoint = true,
  heroFillMode = domainMode === 'delta' ? 'zero' : 'floor',
  displayValueForDelta = (value) => value,
}: OddsChartProps) {
  const chartId = useId();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const touchHoldRef = useRef<number | null>(null);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchLastXRef = useRef(0);
  const [selectedRangeId, setSelectedRangeId] = useState(defaultRangeId ?? rangeOptions?.at(-1)?.id ?? 'season');
  const [scrubClientX, setScrubClientX] = useState<number | null>(null);

  const resolvedRanges = useMemo(
    () => materializedRanges(hero.points, rangeOptions),
    [hero.points, rangeOptions],
  );
  const resolvedReferenceValue = referenceValue ?? (domainMode === 'probability' ? 50 : 0);

  useEffect(() => {
    if (!resolvedRanges.some((range) => range.id === selectedRangeId)) {
      setSelectedRangeId(resolvedRanges.at(-1)?.id ?? 'season');
    }
  }, [resolvedRanges, selectedRangeId]);

  const activeRange = resolvedRanges.find((range) => range.id === selectedRangeId) ?? resolvedRanges.at(-1) ?? DEFAULT_RANGES[0];
  const latestHeroX = hero.points.at(-1)?.x ?? 0;
  const visibleHero = filterPointsForRange(hero.points, latestHeroX, activeRange);
  const visibleComparison = comparison ? filterPointsForRange(comparison.points, latestHeroX, activeRange) : [];
  const visibleBand = band ? filterBandForRange(band.points, latestHeroX, activeRange) : [];
  const seasonView = activeRange.windowMs == null;
  const bounds = chartBounds(
    visibleHero,
    visibleComparison,
    visibleBand,
    domainMode,
    seasonView,
    resolvedReferenceValue,
  );
  const ticks = domainMode === 'probability'
    ? probabilityTicks(bounds.minY, bounds.maxY)
    : deltaTicks(bounds.minY, bounds.maxY, resolvedReferenceValue);
  const visibleTicks = filterTicksBySpacing(ticks, bounds, resolvedReferenceValue);
  const idleHeroPoint = visibleHero.at(-1) ?? null;
  const openHeroPoint = visibleHero[0] ?? idleHeroPoint;
  const idleComparisonPoint = visibleComparison.at(-1) ?? null;

  const scrubbedHeroPoint = useMemo(() => {
    if (scrubClientX == null || !chartRef.current || visibleHero.length === 0) return null;
    const rect = chartRef.current.getBoundingClientRect();
    const localX = clamp(scrubClientX - rect.left, (PLOT.left / 100) * rect.width, (PLOT.right / 100) * rect.width);
    const ratio = (localX - (PLOT.left / 100) * rect.width) / (((PLOT.right - PLOT.left) / 100) * rect.width);
    const targetX = bounds.minX + ratio * Math.max(1, bounds.maxX - bounds.minX);
    return snapPoint(visibleHero, targetX);
  }, [bounds.maxX, bounds.minX, scrubClientX, visibleHero]);

  const activeHeroPoint = scrubbedHeroPoint ?? idleHeroPoint;
  const activeComparisonPoint = activeHeroPoint && visibleComparison.length > 0
    ? snapPoint(visibleComparison, activeHeroPoint.x)
    : idleComparisonPoint;

  const deltaValue = activeHeroPoint && openHeroPoint
    ? displayedDelta(openHeroPoint.y, activeHeroPoint.y, { mapValue: displayValueForDelta })
    : 0;
  const deltaRead = Math.abs(deltaValue) < flatThreshold
    ? { text: flatText, tone: 'neutral' as const }
    : deltaFormatter(deltaValue, activeRange.label);
  const summaryText = openHeroPoint && idleHeroPoint ? summaryFormatter(openHeroPoint.y, idleHeroPoint.y) : null;
  const liveDate = activeHeroPoint ? dateFormatter(activeHeroPoint.x) : null;
  const xLabels = defaultXAxisLabels(visibleHero);
  const heroValueText = activeHeroPoint ? valueFormatter(activeHeroPoint.y) : 'N/A';
  const heroEndpointTop = idleHeroPoint ? yCoord(idleHeroPoint.y, bounds) : null;
  const comparisonEndpointTop = idleComparisonPoint ? yCoord(idleComparisonPoint.y, bounds) : null;
  const comparisonEndpointOffset =
    heroEndpointTop != null
    && comparisonEndpointTop != null
    && Math.abs(comparisonEndpointTop - heroEndpointTop) < 10
      ? -10
      : 0;
  const scrubActive = scrubClientX != null && activeHeroPoint != null;
  const bandFadeStart = visibleBand.length > 0 ? xCoord(visibleBand[0].x, bounds) : PLOT.left;
  const bandFadeInStart = Math.max(PLOT.left, bandFadeStart - 2);
  const bandFadeInEnd = Math.min(PLOT.right, bandFadeStart + 3);

  const heroGradientId = `${chartId}-hero-fill`;
  const deltaGradientId = `${chartId}-delta-fill`;
  const bandGradientId = `${chartId}-band-fill`;

  const clearTouchHold = () => {
    if (touchHoldRef.current != null) {
      window.clearTimeout(touchHoldRef.current);
      touchHoldRef.current = null;
    }
  };

  const endScrub = () => {
    clearTouchHold();
    setScrubClientX(null);
  };

  const updateScrubFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    activateImmediately: boolean,
  ) => {
    if (!chartRef.current) return;
    if (activateImmediately) {
      if (event.pointerType !== 'mouse') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setScrubClientX(event.clientX);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchStartXRef.current = event.clientX;
      touchStartYRef.current = event.clientY;
      touchLastXRef.current = event.clientX;
      clearTouchHold();
      touchHoldRef.current = window.setTimeout(() => {
        setScrubClientX(touchLastXRef.current);
      }, 180);
      return;
    }
    updateScrubFromPointer(event, true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      touchLastXRef.current = event.clientX;
      if (scrubClientX == null) {
        const horizontalDistance = Math.abs(event.clientX - touchStartXRef.current);
        const verticalDistance = Math.abs(event.clientY - touchStartYRef.current);
        if (verticalDistance > 8 && verticalDistance > horizontalDistance) {
          clearTouchHold();
          return;
        }
        if (horizontalDistance > 10) {
          clearTouchHold();
        }
        return;
      }
      setScrubClientX(event.clientX);
      return;
    }
    setScrubClientX(event.clientX);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      endScrub();
      return;
    }
    if (chartRef.current?.matches(':hover')) {
      setScrubClientX(event.clientX);
    } else {
      setScrubClientX(null);
    }
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearTouchHold();
    if (event.pointerType !== 'touch' || scrubClientX != null) {
      setScrubClientX(null);
    }
  };

  const scrubLineLeft = activeHeroPoint ? `${xCoord(activeHeroPoint.x, bounds)}%` : null;
  const cursorDateStyle = useMemo(() => {
    if (!chartRef.current || !activeHeroPoint || scrubClientX == null) return null;
    const width = chartRef.current.getBoundingClientRect().width;
    const x = (xCoord(activeHeroPoint.x, bounds) / 100) * width;
    return { left: `${clamp(x, 48, width - 48)}px` };
  }, [activeHeroPoint, bounds, scrubClientX]);

  return (
    <section className={['odds-chart', className].filter(Boolean).join(' ')}>
      <div className="odds-chart__topline">
        <div className="odds-chart__headline">
          <span className="odds-chart__title">{title}</span>
          {caption ? <span className="odds-chart__caption">{caption}</span> : null}
        </div>
        {resolvedRanges.length > 1 ? (
          <div className="odds-chart__ranges" role="group" aria-label="Chart range">
            {resolvedRanges.map((range) => (
              <button
                aria-pressed={range.id === activeRange.id}
                className={[
                  'odds-chart__range',
                  range.id === activeRange.id ? 'odds-chart__range--active' : '',
                ].filter(Boolean).join(' ')}
                key={range.id}
                onClick={() => {
                  setSelectedRangeId(range.id);
                  setScrubClientX(null);
                }}
                type="button"
              >
                {range.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="odds-chart__header">
        <div className="odds-chart__subject">
          <span className="odds-chart__subject-name">{hero.name}</span>
          <div className="odds-chart__value-row">
            <span className="odds-chart__value">{heroValueText}</span>
            <span className={['odds-chart__delta', `odds-chart__delta--${deltaRead.tone}`].join(' ')}>
              {deltaRead.text}
            </span>
          </div>
          <span className="odds-chart__date">{scrubActive ? liveDate : 'Live'}</span>
        </div>
        {summaryText ? <span className="odds-chart__summary">{summaryText}</span> : null}
      </div>

      <div
        className={['odds-chart__plot', scrubActive ? 'odds-chart__plot--scrubbing' : ''].filter(Boolean).join(' ')}
        onPointerCancel={endScrub}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={chartRef}
      >
        <svg
          aria-label={title}
          className="odds-chart__svg"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <defs>
            <linearGradient id={heroGradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(232, 84, 29, 0.18)" />
              <stop offset="100%" stopColor="rgba(232, 84, 29, 0)" />
            </linearGradient>
            <linearGradient id={deltaGradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(52, 210, 123, 0.18)" />
              <stop offset={`${clamp(((resolvedReferenceValue - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)) * 100, 0, 100)}%`} stopColor="rgba(52, 210, 123, 0.18)" />
              <stop offset={`${clamp(((resolvedReferenceValue - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)) * 100, 0, 100)}%`} stopColor="rgba(255, 92, 77, 0.18)" />
              <stop offset="100%" stopColor="rgba(255, 92, 77, 0.18)" />
            </linearGradient>
            <linearGradient id={bandGradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset={`${bandFadeInStart}%`} stopColor="rgba(244, 245, 242, 0)" />
              <stop offset={`${bandFadeInEnd}%`} stopColor="rgba(244, 245, 242, 0.08)" />
              <stop offset="100%" stopColor="rgba(244, 245, 242, 0.08)" />
            </linearGradient>
          </defs>

          {visibleTicks.map((tick) => (
            <line
              className={[
                'odds-chart__grid',
                Math.abs(tick - resolvedReferenceValue) < 0.001 ? 'odds-chart__grid--anchor' : '',
              ].filter(Boolean).join(' ')}
              key={`grid-${tick}`}
              x1={PLOT.left}
              x2={PLOT.right}
              y1={yCoord(tick, bounds)}
              y2={yCoord(tick, bounds)}
            />
          ))}

          {band && visibleBand.length > 1 ? (
            <path className="odds-chart__band" d={bandPath(visibleBand, bounds)} fill={`url(#${bandGradientId})`} />
          ) : null}

          {comparison && visibleComparison.length > 1 ? (
            <path className="odds-chart__line odds-chart__line--compare" d={linePath(visibleComparison, bounds)} />
          ) : null}

          {heroFillMode !== 'none' && visibleHero.length > 1 ? (
            <path
              className={[
                'odds-chart__area',
                heroFillMode === 'zero' ? 'odds-chart__area--delta' : 'odds-chart__area--hero',
              ].join(' ')}
              d={areaPathToBaseline(visibleHero, bounds, heroFillMode === 'zero' ? resolvedReferenceValue : bounds.minY)}
              fill={`url(#${heroFillMode === 'zero' ? deltaGradientId : heroGradientId})`}
            />
          ) : null}

          {visibleHero.length > 1 ? (
            <path className="odds-chart__line odds-chart__line--hero" d={linePath(visibleHero, bounds)} />
          ) : null}
        </svg>

        <div className="odds-chart__y-axis" aria-hidden="true">
          {visibleTicks
            .slice()
            .reverse()
            .map((tick) => (
              <span
                className={[
                  'odds-chart__y-tick',
                  Math.abs(tick - resolvedReferenceValue) < 0.001 ? 'odds-chart__y-tick--anchor' : '',
                ].filter(Boolean).join(' ')}
                key={`tick-${tick}`}
                style={{ top: `${yCoord(tick, bounds)}%` }}
              >
                {yTickFormatter(tick)}
              </span>
            ))}
        </div>

        {scrubActive && scrubLineLeft ? (
          <>
            <span className="odds-chart__scrub-wash" style={{ left: scrubLineLeft }} />
            <span className="odds-chart__scrub-line" style={{ left: scrubLineLeft }} />
            <span
              className="odds-chart__scrub-dot odds-chart__scrub-dot--hero"
              style={{
                left: `${xCoord(activeHeroPoint.x, bounds)}%`,
                top: `${yCoord(activeHeroPoint.y, bounds)}%`,
              }}
            />
            {activeComparisonPoint ? (
              <span
                className="odds-chart__scrub-dot odds-chart__scrub-dot--compare"
                style={{
                  left: `${xCoord(activeComparisonPoint.x, bounds)}%`,
                  top: `${yCoord(activeComparisonPoint.y, bounds)}%`,
                }}
              />
            ) : null}
            {cursorDateStyle && liveDate ? (
              <span className="odds-chart__scrub-date" style={cursorDateStyle}>
                {liveDate}
              </span>
            ) : null}
          </>
        ) : null}

        {!scrubActive && idleHeroPoint ? (
          <span
            className="odds-chart__beacon"
            style={{
              left: `${xCoord(idleHeroPoint.x, bounds)}%`,
              top: `${yCoord(idleHeroPoint.y, bounds)}%`,
            }}
          />
        ) : null}

        {!scrubActive && showHeroEndpoint && idleHeroPoint && heroEndpointTop != null ? (
          <span className="odds-chart__endpoint odds-chart__endpoint--hero" style={{ top: `${heroEndpointTop}%` }}>
            {hero.avatarUrl != null ? <TeamAvatar avatarUrl={hero.avatarUrl} name={hero.name} /> : null}
            <span>
              <strong>{hero.name}</strong>
              {hero.endpointDetail ? <span>{hero.endpointDetail}</span> : null}
            </span>
          </span>
        ) : null}

        {!scrubActive && showComparisonEndpoint && comparison && idleComparisonPoint && comparisonEndpointTop != null ? (
          <span
            className="odds-chart__endpoint-label"
            style={{ top: `${comparisonEndpointTop + comparisonEndpointOffset}%` }}
          >
            {shortCodeFor(comparison.name, comparison.shortLabel)}
          </span>
        ) : null}

        {!scrubActive ? (
          <div className="odds-chart__x-axis" aria-hidden="true">
            {xLabels.map((point) => (
              <span key={`x-${point.x}`} style={{ left: `${xCoord(point.x, bounds)}%` }}>
                {xTickFormatter(point.x)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {footer ? <div className="odds-chart__footer">{footer}</div> : null}
    </section>
  );
}
