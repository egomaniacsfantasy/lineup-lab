/**
 * The pure parts of turning Supabase rows into league connections.
 *
 * Split out of LeagueConnectionContext so it can be imported by a test. The
 * context itself pulls in React and the Supabase client and cannot be loaded
 * outside a bundler, which is why the naming bug it used to contain could only
 * ever be checked by grepping the source — and grep does not notice a mapping
 * that is present but wrong.
 */

export interface DbLeagueRow {
  provider: string;
  league_id: string;
  season: string | null;
  member_id: string | null;
  username: string | null;
  display_name: string | null;
  /* Optional because the column is newer than the table. */
  league_name?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * The league's own name, or undefined.
 *
 * This is the whole fix. The mapping used to omit it, so every consumer fell
 * through to displayName — the account's username, identical on every row —
 * and a switcher holding fourteen leagues showed one name fourteen times.
 *
 * Empty string counts as absent: a row written before the column existed, or
 * one saved from a connection that had no name yet, must fall back rather than
 * render as a league whose name is nothing.
 */
export function leagueNameFromRow(row: Pick<DbLeagueRow, 'league_name'>): string | undefined {
  const name = row.league_name;
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Carry known league names across a rehydrate from the account.
 *
 * The account rows are the source of truth for WHICH leagues exist. They are
 * not the source of truth for what those leagues are CALLED — a row written
 * before the league_name column existed has no name at all, and neither does
 * any row while the migration is still unrun.
 *
 * Rebuilding the switcher straight from rows therefore replaced real names with
 * nothing, and the effect that refetches names from Sleeper put them back a
 * second later. The two took turns: names, usernames, names, usernames, every
 * couple of seconds, forever. It reads as a rendering glitch and is actually
 * two writers disagreeing about who owns the field.
 *
 * This is the same bug the ESPN cookies had, and the fix is the same one — the
 * rehydrate merges over what is already known instead of replacing it. A name
 * is only ever overwritten by another name, never by an absence.
 */
export function mergeLeagueNames<T extends { provider: string; leagueId: string; leagueName?: string }>(
  incoming: T[],
  known: readonly { provider: string; leagueId: string; leagueName?: string }[],
): T[] {
  const knownByKey = new Map(
    known
      .filter((league) => league.leagueName)
      .map((league) => [`${league.provider}:${league.leagueId}`, league.leagueName as string]),
  );
  return incoming.map((league) =>
    league.leagueName
      ? league
      : { ...league, leagueName: knownByKey.get(`${league.provider}:${league.leagueId}`) },
  );
}

/**
 * League names, remembered on this device.
 *
 * Measured against a real account before writing this: every Sleeper league in
 * the switcher was showing the manager's username instead of its name, and the
 * only thing wrong was that the API had gone cold. GET /api/connect/:username
 * answered 503, the client's single 1.2s retry hit the same cold server, the
 * failure was swallowed, and nothing tried again for the rest of the session.
 * Warming the server and reloading brought all thirteen names back with no code
 * change at all. So the names were never missing — they were one flaky request
 * away from existing, every single time the app opened.
 *
 * That is too fragile a footing for the label on every row. A name we have
 * already seen is now written down here and read back instantly on the next
 * load, so a cold start, an offline moment or a slow provider costs nothing.
 * The network becomes an upgrade path rather than a prerequisite.
 *
 * This is deliberately a cache and not a source of truth: it only ever fills in
 * a name that is otherwise absent, and any real name from the account or a
 * provider overwrites it. It is also per-device, which is exactly why the
 * league_name column still matters for a second device — this is the floor,
 * not the ceiling.
 */
const NAME_CACHE_KEY = 'og.olympus.league-names';

type NameCache = Record<string, string>;

function readNameCache(): NameCache {
  try {
    const raw = window.localStorage.getItem(NAME_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: NameCache = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Records every name present; never erases one. Returns true if anything changed. */
export function rememberLeagueNames(
  leagues: readonly { provider: string; leagueId: string; leagueName?: string }[],
): boolean {
  try {
    const cache = readNameCache();
    let changed = false;
    for (const league of leagues) {
      const name = league.leagueName?.trim();
      if (!name) continue;
      const key = `${league.provider}:${league.leagueId}`;
      if (cache[key] === name) continue;
      cache[key] = name;
      changed = true;
    }
    if (changed) window.localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache));
    return changed;
  } catch {
    /* Private browsing. Names still work for this session; they just do not
       survive it, which is the behaviour we already had. */
    return false;
  }
}

/** Fills in names we have seen before, for leagues that currently have none. */
export function applyCachedLeagueNames<
  T extends { provider: string; leagueId: string; leagueName?: string },
>(leagues: T[]): T[] {
  const cache = readNameCache();
  if (Object.keys(cache).length === 0) return leagues;
  return leagues.map((league) =>
    league.leagueName
      ? league
      : { ...league, leagueName: cache[`${league.provider}:${league.leagueId}`] },
  );
}

/** Test seam. */
export function clearLeagueNameCache() {
  try {
    window.localStorage.removeItem(NAME_CACHE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Are these two switcher lists the same, as far as anything on screen cares?
 *
 * React compares state by reference, so handing back a freshly built array of
 * identical leagues still counts as a change. The rehydrate rebuilds that array
 * every time it runs, which re-triggered the Sleeper name refresh, which set
 * state again. Nothing visibly flickered once names stopped being erased, but
 * the two effects kept waking each other up and firing a network request each
 * round. Bailing on an unchanged list is what actually stops the loop rather
 * than hiding it.
 */
export function sameLeagueList(
  a: readonly { provider: string; leagueId: string; leagueName?: string; season?: string }[],
  b: readonly { provider: string; leagueId: string; leagueName?: string; season?: string }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((league, index) => {
    const other = b[index];
    return (
      other != null
      && league.provider === other.provider
      && league.leagueId === other.leagueId
      && league.leagueName === other.leagueName
      && league.season === other.season
    );
  });
}

/**
 * Does this Supabase error mean olympus_leagues has no league_name column?
 *
 * PostgREST reports an unknown column as PGRST204 and names it in the message.
 * The name is matched as well as the code so that an unrelated PGRST204 cannot
 * switch league names off for the rest of the session.
 */
export function isMissingLeagueNameColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return (error.code === 'PGRST204' || /column/i.test(message)) && /league_name/.test(message);
}

/**
 * The NFL season a moment falls in.
 *
 * The calendar year, except January and February, which still belong to the
 * season that kicked off the autumn before: the title game is played in
 * February and nobody wants their league pruned during it. Sleeper flips its
 * own season a week or two after that game, so the two agree for all but a
 * fortnight, and in that fortnight the only difference is that last year's
 * leagues linger until March.
 */
export function nflSeasonOf(now: Date = new Date()): string {
  const year = now.getFullYear();
  return String(now.getMonth() < 2 ? year - 1 : year);
}

/**
 * Leagues filed under an earlier season than the one given.
 *
 * These are the rows the switcher used to carry forever. Sleeper does not roll
 * a league forward: every season is a new league with a new id, so an account
 * that connected in 2025 and again in 2026 held both, and the 2025 copies
 * stayed in the list a year later under raw ids, because the name refresh
 * only asks about the current season. Andre's phone showed five of them.
 *
 * A league with no recorded season is kept: there is nothing to judge it by,
 * and the oldest rows on the table predate the column. The comparison is
 * numeric so a league filed under NEXT season, which Sleeper does during a
 * rollover, is never mistaken for an old one.
 */
export function priorSeasonLeagues<T extends { season?: string | null }>(
  leagues: readonly T[],
  season: string | null | undefined,
): T[] {
  const cutoff = Number(season);
  if (!Number.isFinite(cutoff)) return [];
  return leagues.filter((league) => {
    const filed = Number(league.season);
    return league.season != null && league.season !== '' && Number.isFinite(filed) && filed < cutoff;
  });
}

/**
 * The season to judge the account's rows against, given what Sleeper lists.
 *
 * Normally Sleeper's own current season. But the lookup falls back to last
 * season's leagues when nothing is filed under this one yet (see
 * server/leagueChoices.js), and pruning "last season" at that moment would
 * empty the switcher for somebody who plainly has leagues. So the cutoff is
 * the newest season Sleeper actually listed, and the state season only when
 * it listed nothing.
 */
export function newestListedSeason(
  listed: readonly { season?: string | null }[],
  stateSeason: string | null | undefined,
): string | null {
  let newest: number | null = null;
  for (const league of listed) {
    const filed = Number(league.season);
    if (!Number.isFinite(filed) || league.season == null || league.season === '') continue;
    if (newest == null || filed > newest) newest = filed;
  }
  if (newest != null) return String(newest);
  return stateSeason != null && stateSeason !== '' ? String(stateSeason) : null;
}

/**
 * Sleeper rows this account holds that Sleeper no longer lists.
 *
 * A league you left, were removed from, or that the commissioner deleted stays
 * on the account forever: nothing ever asked Sleeper whether the row still
 * meant anything, and the league sheet cannot remove it because the sheet only
 * offers what Sleeper lists. Three of Andre's rows were test leagues deleted
 * in July, still in the switcher in October as bare ids.
 *
 * Scoped three ways so a flaky answer cannot take real leagues with it: only
 * rows for the Sleeper user the lookup was for (an account could in principle
 * hold a second username), only rows filed under the cutoff season or later
 * (older ones are the prior-season rule's business), and nothing at all when
 * Sleeper listed nothing, because an empty list is what a failed lookup looks
 * like too.
 */
export function deadSleeperLeagues<
  T extends { provider: string; leagueId: string; userId: string; season?: string | null },
>(
  leagues: readonly T[],
  lookup: {
    user: { id: string };
    season: string | null | undefined;
    leagues: readonly { id: string; season?: string | null }[];
  },
): T[] {
  if (lookup.leagues.length === 0) return [];
  const cutoff = Number(newestListedSeason(lookup.leagues, lookup.season));
  const listed = new Set(lookup.leagues.map((league) => String(league.id)));
  return leagues.filter((league) => {
    if (league.provider !== 'sleeper' || league.userId !== lookup.user.id) return false;
    if (listed.has(league.leagueId)) return false;
    if (league.season == null || league.season === '') return true;
    const filed = Number(league.season);
    return !Number.isFinite(cutoff) || !Number.isFinite(filed) || filed >= cutoff;
  });
}
