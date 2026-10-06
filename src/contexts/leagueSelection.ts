/**
 * Which leagues are on the account, and in what order.
 *
 * Sleeper answers a username with every league that account is in. Adopting
 * that list wholesale is how a switcher fills up with a dozen entries nobody
 * chose, so the list is curated: you tick the ones you want when you first
 * arrive, you can come back and tick more (or untick) at any point, and the
 * ones you care about most can be pinned to the top.
 *
 * This is the pure half, kept out of LeagueConnectionContext for the same
 * reason leagueRows is: the context pulls in React and the Supabase client
 * and cannot be loaded by a test.
 */

interface Keyed {
  provider: string;
  leagueId: string;
}

export function leagueKeyOf(league: Keyed) {
  return `${league.provider}:${league.leagueId}`;
}

/* ── Pins ─────────────────────────────────────────────────────────────────
   Per device, like the removal tombstones and the name cache. The account
   table has no column for a pin; this is the floor that works today, and a
   column can sync it across devices later without changing the shape. */

const PINNED_KEY = 'og.olympus.pinned-leagues';

export function readPinnedKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(PINNED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))];
  } catch {
    return [];
  }
}

export function writePinnedKeys(keys: readonly string[]) {
  try {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify([...keys]));
  } catch {
    /* Private browsing: the pin lasts the session. */
  }
}

/** Pin order is the order things were pinned in: the newest pin goes last,
 *  so pinning a second league never shuffles the first. */
export function togglePinnedKey(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((entry) => entry !== key) : [...keys, key];
}

/** A pin for a league that is no longer on the account is noise. */
export function prunePinnedKeys(keys: readonly string[], leagues: readonly Keyed[]): string[] {
  const present = new Set(leagues.map(leagueKeyOf));
  return keys.filter((key) => present.has(key));
}

/**
 * Pinned leagues first, in pin order; everything else after, in the order it
 * already had. Stable, so an unpinned list is returned exactly as given.
 */
export function orderLeagues<T extends Keyed>(leagues: readonly T[], pinnedKeys: readonly string[]): T[] {
  if (pinnedKeys.length === 0) return [...leagues];
  const rank = new Map(pinnedKeys.map((key, index) => [key, index]));
  const pinned = leagues
    .filter((league) => rank.has(leagueKeyOf(league)))
    .sort((a, b) => rank.get(leagueKeyOf(a))! - rank.get(leagueKeyOf(b))!);
  const rest = leagues.filter((league) => !rank.has(leagueKeyOf(league)));
  return [...pinned, ...rest];
}

/* ── Selection ────────────────────────────────────────────────────────── */

interface Summary {
  id: string;
}

/**
 * What changes when the ticks are saved.
 *
 * `available` is everything Sleeper returned, `onAccount` the ids already in
 * the switcher, `ticked` what the sheet shows as chosen. Only leagues Sleeper
 * actually listed can be removed here: a league on the account that Sleeper
 * no longer returns (archived, last season) is not on the sheet, so leaving
 * it "unticked" must not delete it.
 */
export function diffSelection<T extends Summary>({
  available,
  onAccount,
  ticked,
}: {
  available: readonly T[];
  onAccount: ReadonlySet<string>;
  ticked: ReadonlySet<string>;
}): { add: T[]; removeIds: string[] } {
  const add = available.filter((league) => ticked.has(league.id) && !onAccount.has(league.id));
  const removeIds = available
    .filter((league) => !ticked.has(league.id) && onAccount.has(league.id))
    .map((league) => league.id);
  return { add, removeIds };
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** The save button says what pressing it will do. */
export function selectionLabel(addCount: number, removeCount: number) {
  if (addCount === 0 && removeCount === 0) return 'No changes';
  if (removeCount === 0) return `Add ${count(addCount, 'league')}`;
  if (addCount === 0) return `Remove ${count(removeCount, 'league')}`;
  return `Add ${addCount}, remove ${removeCount}`;
}

/**
 * The connection the anonymous peek hands the app after sign-up.
 *
 * It used to carry every league on the Sleeper account, so somebody who typed
 * their username on the landing page, picked ONE league to see priced and made
 * an account arrived to a switcher holding all thirteen. It carries the league
 * they looked at and nothing else; the rest are offered on a sheet they tick.
 */
export function narrowToLeague<
  T extends { leagueId: string; allLeagueIds: string[]; allLeagues?: { id: string; name: string; season?: string }[] },
>(connection: T, league: { id: string; name: string; season?: string }): T {
  return {
    ...connection,
    leagueId: league.id,
    allLeagueIds: [league.id],
    allLeagues: [{ id: league.id, name: league.name, season: league.season }],
  };
}
