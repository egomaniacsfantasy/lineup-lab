/**
 * LIVE mode orchestration for in-game odds.
 *
 * An admin flips live mode ON before a game window; a 30s loop then scrapes the
 * NFL scoreboard once and, for every registered league, recomputes a LIVE OVERLAY
 * (closed-form matchup win% + simulateSeasonLive futures) off a cached per-league
 * baseline. The /lines route merges the overlay onto the served price. Flip OFF
 * and the overlays are cleared, so everything reverts to the static price.
 *
 * When live mode is OFF this module does nothing and the app is unchanged.
 *
 * The cycle body is INJECTED (registerCycle) from api.js, which owns
 * loadLeagueContext + the engine; this keeps liveEngine free of a circular import.
 */

// Live refresh cadence. 90s keeps upstream call volume low as league count
// scales (see LIVE_MATCHUP_TTL_MS in gameWindows.js, sized just under this).
const CYCLE_MS = 90_000;

const state = {
  on: false,
  timer: null,
  running: false, // a cycle is in flight — prevents overlapping cycles (see tick)
  at: 0, // last successful cycle
  overlays: new Map(), // leagueId -> overlay {at, week, sides, futures}
  baselines: new Map(), // leagueId -> { sig, baseline }
};

let runCycleFn = null;

/** api.js registers the per-cycle worker here (avoids a circular import). */
export function registerCycle(fn) {
  runCycleFn = fn;
}

export function isLiveOn() {
  return state.on;
}

export function liveStatus() {
  return { on: state.on, at: state.at, leagues: state.overlays.size, cycleMs: CYCLE_MS };
}

export function getOverlay(leagueId) {
  return state.overlays.get(String(leagueId)) ?? null;
}

export function setOverlay(leagueId, overlay) {
  if (!overlay) return;
  state.overlays.set(String(leagueId), overlay);
  state.at = Date.now();
}

/**
 * Per-league baseline cache. `sig` folds in projection version + week + every
 * roster's starters + playoff settings, so a trade / waiver / lineup / projection
 * change or a week rollover recomputes the baseline automatically.
 */
export function getBaseline(leagueId, sig, factory) {
  const cur = state.baselines.get(String(leagueId));
  if (cur && cur.sig === sig) return cur.baseline;
  const baseline = factory();
  state.baselines.set(String(leagueId), { sig, baseline });
  return baseline;
}

/**
 * Merge a live overlay onto a static priced object for the RESPONSE only (the
 * stamped line history stays on the static/6h price). Overwrites each matchup
 * side's numeric line fields, swaps in the live futures, and attaches the
 * per-player live block (livePlayers: id -> {current, projected}) so the lineup
 * rows can show current points + live projected final; preserves histograms,
 * unpriced/zeroed flags, and everything else.
 */
export function mergeLiveOverlay(pricing, overlay) {
  if (!pricing?.available || !overlay) return pricing;
  const lines = (pricing.lines ?? []).map((line) => {
    const ov = overlay.sides?.[line.matchupId];
    if (!ov) return line;
    const sides = { ...line.sides };
    for (const rid of Object.keys(sides)) {
      if (ov[rid]) sides[rid] = { ...sides[rid], ...ov[rid] };
    }
    return { ...line, sides };
  });
  return {
    ...pricing,
    lines,
    futures: overlay.futures ?? pricing.futures,
    livePlayers: overlay.players ?? null,
    live: { at: overlay.at, week: overlay.week },
  };
}

async function tick() {
  // Re-entrancy guard: a full cycle can take LONGER than CYCLE_MS (many leagues),
  // and the interval fires regardless — so without this a new cycle would launch on
  // top of the still-running one, and the overlap compounds until the instance runs
  // out of memory / blocks the health check and RESTARTS (wiping live mode). Skip the
  // tick while one is in flight; the next interval fire starts a fresh one.
  if (!state.on || !runCycleFn || state.running) return;
  state.running = true;
  try {
    await runCycleFn();
  } catch (err) {
    console.error('[live] cycle failed:', err?.message ?? err);
  } finally {
    state.running = false;
  }
}

/** Turn live mode on/off. On: run one cycle now, then every 30s. Off: stop and
 *  clear overlays so the app reverts to static pricing. */
export function setLiveMode(on) {
  const next = on === true;
  if (next === state.on) return liveStatus();
  state.on = next;
  if (next) {
    void tick();
    state.timer = setInterval(() => { void tick(); }, CYCLE_MS);
    state.timer.unref?.();
    console.log('[live] mode ON (30s cycle)');
  } else {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    state.overlays.clear();
    state.at = 0;
    console.log('[live] mode OFF');
  }
  return liveStatus();
}
