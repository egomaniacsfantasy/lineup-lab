/**
 * NFL game-window schedule (US/Eastern), used to gate fast polling.
 * Inside a window: matchup polling every 60–120s. Outside: hourly.
 *
 * Windows (ET):
 *   Thu 19:00–24:00 (TNF)
 *   Sun 12:30–24:00 (all Sunday slates incl. SNF)
 *   Mon 19:00–24:00 (MNF)
 */

function easternParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    day: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function isGameWindow(date = new Date()) {
  const { day, minutes } = easternParts(date);

  if (day === 'Thu' || day === 'Mon') {
    return minutes >= 19 * 60;
  }

  if (day === 'Sun') {
    return minutes >= 12 * 60 + 30;
  }

  return false;
}

/** Cache TTL for live matchup data given the current window state. */
export function matchupTtlMs(date = new Date()) {
  return isGameWindow(date) ? 90_000 : 60 * 60_000;
}
