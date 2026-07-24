interface DisplayDeltaOptions {
  digits?: number;
  mapValue?: (value: number) => number;
  suffix?: string;
}

function roundDisplayedValue(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

export function displayedValue(
  value: number,
  { digits = 1, mapValue = (raw: number) => raw }: Omit<DisplayDeltaOptions, 'suffix'> = {},
) {
  return roundDisplayedValue(mapValue(value), digits);
}

export function displayedDelta(
  before: number,
  after: number,
  { digits = 1, mapValue = (raw: number) => raw }: Omit<DisplayDeltaOptions, 'suffix'> = {},
) {
  const displayedBefore = displayedValue(before, { digits, mapValue });
  const displayedAfter = displayedValue(after, { digits, mapValue });
  return roundDisplayedValue(displayedAfter - displayedBefore, digits);
}

export function formatSignedDisplayedDeltaValue(
  delta: number,
  { digits = 1, suffix = '%' }: Omit<DisplayDeltaOptions, 'mapValue'> = {},
) {
  return `${delta > 0 ? '+' : ''}${delta.toFixed(digits)}${suffix}`;
}

export function formatDisplayedDelta(
  before: number,
  after: number,
  options: DisplayDeltaOptions = {},
) {
  return formatSignedDisplayedDeltaValue(displayedDelta(before, after, options), options);
}
