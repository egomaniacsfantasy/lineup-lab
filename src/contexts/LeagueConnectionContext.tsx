/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  connectUsername,
  fetchBootstrap,
  fetchLiveStatus,
  fetchSchedule,
  refreshLeague,
  setApiContext,
  type ApiLeagueSummary,
  type LeagueBootstrap,
  type LeaguePricing,
  type LineHistoryEntry,
  type ScheduleWeek,
  apiUrl,
} from '../services/leagueApi';
import {
  type CachedLeaguePricingSnapshot,
  fetchLeaguePricingSnapshot,
  readCachedLeaguePricing,
} from '../services/leaguePricingCache';
import { supabase } from '../services/supabase';
import {
  applyCachedLeagueNames,
  isMissingLeagueNameColumn,
  leagueNameFromRow,
  mergeLeagueNames,
  rememberLeagueNames,
  sameLeagueList,
  type DbLeagueRow,
} from './leagueRows';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'og.olympus.connected-league';
/**
 * Which ESPN leagues this device has confirmed a team for.
 *
 * Before the identity fix, connecting to a league somebody else had already
 * linked could stamp you with THAT person's ESPN member id, so you opened the
 * app looking at their roster. The server no longer does that, but a connection
 * already saved with the wrong owner is indistinguishable from a right one, so
 * each ESPN league has to be re-confirmed once by picking a team.
 *
 * This was first written as a version number ON the connection object, and that
 * was the wrong shape. A connection gets rebuilt constantly: from account rows,
 * from a merge of rows over the local copy, from the league switcher's list.
 * Every one of those constructs a fresh object, and every one silently dropped
 * the field. I patched three such paths and the fourth, the switcher, is the
 * one that mattered: clicking your ESPN league in the list handed activateLocal
 * a row-derived object with no stamp, which the next read threw away. Click the
 * league, watch it vanish.
 *
 * So the trust does not travel with the object any more. It lives here, keyed
 * by league id, and every path asks the same question of the same record.
 */
const CONFIRMED_KEY = 'og.olympus.espn-confirmed';
const IDENTITY_RECHECK_KEY = 'og.olympus.espn-identity-recheck';

function readConfirmed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(CONFIRMED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/**
 * Forget which team is yours in an ESPN league, so the picker asks again.
 *
 * Picking the wrong team from that list is easy and, until now, permanent: the
 * league would keep opening on somebody else's roster with no way back short of
 * removing the league and starting over.
 */
function forgetEspnLeague(leagueId: string) {
  try {
    const next = readConfirmed();
    next.delete(String(leagueId));
    window.localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...next]));
  } catch {
    /* Nothing to forget if nothing could be written in the first place. */
  }
}

function confirmEspnLeague(leagueId: string) {
  try {
    const next = readConfirmed();
    next.add(String(leagueId));
    window.localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...next]));
  } catch {
    /* Private browsing: the confirmation lasts the session, which means one
       extra pick next visit rather than a wrong team. */
  }
}
const MARKET_SCAN_KEY = 'og.market.last-scan';
const MARKET_SCAN_COOLDOWN_MS = 30_000;

interface StoredLeagueSummary {
  id: string;
  name: string;
  season?: string;
}

export interface StoredConnection {
  provider: 'sleeper' | 'espn';
  leagueId: string;
  /** Friendly league name for the switcher. Persisted locally and, once the
   *  olympus_leagues.league_name column exists, on the account — so a league
   *  loaded fresh on another device carries its own name instead of falling
   *  back to the manager name, which is identical on every row. */
  leagueName?: string;
  userId: string;
  username: string;
  displayName: string;
  /** Multi-league seam: all of the user's leagues are stored on connect;
   *  one is active. A header league switcher is a later pass. */
  allLeagueIds: string[];
  allLeagues?: StoredLeagueSummary[];
  /** ESPN-only: season + (private league) the user's own read-only cookies. */
  season?: string;
  espnS2?: string | null;
  swid?: string | null;
}

/** Point the API client at the right provider for a connection. */
function applyApiContext(connection: StoredConnection | null) {
  if (connection?.provider === 'espn') {
    setApiContext({
      provider: 'espn',
      season: connection.season,
      espnS2: connection.espnS2 ?? null,
      swid: connection.swid ?? null,
    });
  } else {
    setApiContext({ provider: 'sleeper' });
  }
}

interface LeagueConnectionValue {
  stored: StoredConnection | null;
  /** Every league saved to this account; `stored` is the active one. */
  leagues: StoredConnection[];
  bootstrap: LeagueBootstrap | null;
  schedule: ScheduleWeek[] | null;
  pricing: LeaguePricing | null;
  pricingMeta: {
    isFetching: boolean;
    isStale: boolean;
    hasResolved: boolean;
    lastUpdatedAt: number | null;
  };
  lineHistory: LineHistoryEntry[] | null;
  isLoading: boolean;
  error: string | null;
  connect: (connection: StoredConnection) => void;
  switchLeague: (provider: StoredConnection['provider'], leagueId: string) => void;
  disconnect: () => void;
  removeLeague: (league: StoredConnection) => void;
  /** ESPN only: forget which team is yours so the picker asks again. */
  changeEspnTeam: (league: StoredConnection) => void;
  refresh: () => Promise<void>;
  liveMode: { on: boolean; at: number };
  marketScan: {
    isScanning: boolean;
    lastScannedAt: number | null;
    cooldownMs: number;
  };
  scanMarket: () => Promise<LeaguePricing | null>;
}

/** Stable identity for a saved league across providers. */
function leagueKey(c: { provider: string; leagueId: string }) {
  return `${c.provider}:${c.leagueId}`;
}

function hydrateKey(c: StoredConnection) {
  return `${c.provider}:${c.leagueId}:${c.userId}:${c.season ?? ''}`;
}

function readLastMarketScan(leagueId: string) {
  try {
    const raw = window.localStorage.getItem(MARKET_SCAN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return typeof parsed[leagueId] === 'number' ? parsed[leagueId] : null;
  } catch {
    return null;
  }
}

function writeLastMarketScan(leagueId: string, timestamp: number) {
  try {
    const raw = window.localStorage.getItem(MARKET_SCAN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[leagueId] = timestamp;
    window.localStorage.setItem(MARKET_SCAN_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage failures
  }
}

function activeConnectionChanged(a: StoredConnection | null, b: StoredConnection | null) {
  if (!a || !b) return a !== b;
  return (
    leagueKey(a) !== leagueKey(b) ||
    a.userId !== b.userId ||
    a.leagueName !== b.leagueName ||
    a.allLeagueIds.join('|') !== b.allLeagueIds.join('|')
  );
}

const LeagueConnectionContext = createContext<LeagueConnectionValue | null>(null);

const EMPTY_PRICING_META: LeagueConnectionValue['pricingMeta'] = {
  isFetching: false,
  isStale: false,
  hasResolved: false,
  lastUpdatedAt: null,
};

function hasSuggestionPayload(pricing: LeaguePricing | null | undefined) {
  return (pricing?.userSwaps?.length ?? 0) > 0 || (pricing?.movers?.length ?? 0) > 0;
}

/**
 * Can this connection's "which team is mine" answer be trusted?
 *
 * False for any ESPN connection written before the identity fix, because it may
 * carry the member id of whoever linked the league first. There is no way to
 * tell a poisoned one from a correct one, so both are re-confirmed.
 *
 * This has to gate EVERY path that can make a connection active, not just the
 * one that reads localStorage. The account rows are the other one, and rows
 * carry no identity version at all: dropping the local copy while the rows kept
 * restoring it made the connection vanish on load and come back mid-session,
 * still pointing at the wrong team.
 */
function trustedForIdentity(connection: StoredConnection | null | undefined): boolean {
  if (!connection) return false;
  if (connection.provider !== 'espn') return true;
  return readConfirmed().has(String(connection.leagueId));
}

function flagIdentityRecheck() {
  try {
    window.localStorage.setItem(IDENTITY_RECHECK_KEY, '1');
  } catch {
    /* The banner is a courtesy; losing it does not make the drop wrong. */
  }
}

function readStored(): StoredConnection | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredConnection) : null;

    /* An ESPN connection from before the identity fix cannot be trusted to be
       the right team, so it is dropped rather than shown. Sleeper is untouched:
       it never resolved identity from a shared store. */
    if (parsed && !trustedForIdentity(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      flagIdentityRecheck();
      applyApiContext(null);
      return null;
    }

    // Point the API client at the right provider before the first fetch.
    applyApiContext(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** One-shot: did we just drop a connection whose team we could not trust? */
export function consumeEspnIdentityRecheck(): boolean {
  try {
    if (window.localStorage.getItem(IDENTITY_RECHECK_KEY) !== '1') return false;
    window.localStorage.removeItem(IDENTITY_RECHECK_KEY);
    return true;
  } catch {
    return false;
  }
}


/** A saved-league row from Supabase becomes a connection (cookies live
 *  server-side, so they stay null here). */
function rowToConnection(row: DbLeagueRow): StoredConnection {
  return {
    provider: row.provider === 'espn' ? 'espn' : 'sleeper',
    leagueId: row.league_id,
    leagueName: leagueNameFromRow(row),
    userId: row.member_id ?? '',
    username: row.username ?? '',
    displayName: row.display_name ?? '',
    allLeagueIds: [row.league_id],
    season: row.season ?? undefined,
    espnS2: null,
    swid: null,
  };
}

function connectionFromSummary(
  base: StoredConnection,
  summary: StoredLeagueSummary,
  allLeagues: StoredLeagueSummary[],
): StoredConnection {
  return {
    provider: base.provider,
    leagueId: summary.id,
    leagueName: summary.name,
    userId: base.userId,
    username: base.username,
    displayName: base.displayName,
    allLeagueIds: allLeagues.map((league) => league.id),
    allLeagues,
    season: summary.season ?? base.season,
    espnS2: base.espnS2 ?? null,
    swid: base.swid ?? null,
  };
}

function connectionsFromKnownLeagues(connection: StoredConnection) {
  const summaries = connection.allLeagues?.length
    ? connection.allLeagues
    : [{
        id: connection.leagueId,
        name: connection.leagueName ?? `${connection.provider} league`,
        season: connection.season,
      }];
  return summaries.map((summary) => connectionFromSummary(connection, summary, summaries));
}

function sleeperSummaries(leagues: ApiLeagueSummary[]): StoredLeagueSummary[] {
  return leagues.map((league) => ({
    id: league.id,
    name: league.name,
    season: league.season,
  }));
}

/**
 * Whether olympus_leagues has the league_name column yet.
 *
 * The column is a migration Andre runs by hand in Supabase, and the code has
 * to work on both sides of it — shipping a write that names a column the table
 * does not have would break saving a league entirely, and demanding the SQL
 * land first turns a one-line change into a coordinated deploy. So: assume it
 * is there, notice the specific schema error if it is not, and stop asking for
 * the rest of the session.
 */
let leagueNameColumn: 'assumed' | 'present' | 'absent' = 'assumed';

function leagueRow(userId: string, c: StoredConnection, isActive: boolean) {
  const row: Record<string, unknown> = {
    user_id: userId,
    provider: c.provider,
    league_id: c.leagueId,
    season: c.season ?? null,
    member_id: c.userId,
    username: c.username,
    display_name: c.displayName,
    is_active: isActive,
  };
  if (leagueNameColumn !== 'absent') row.league_name = c.leagueName ?? null;
  return row;
}

/** Upsert, and retry once without the name if the column is not there yet. */
async function upsertRows(rows: Record<string, unknown>[]) {
  const { error } = await supabase
    .from('olympus_leagues')
    .upsert(rows, { onConflict: 'user_id,provider,league_id' });

  if (!error) {
    if (leagueNameColumn === 'assumed') leagueNameColumn = 'present';
    return;
  }

  if (!isMissingLeagueNameColumn(error)) {
    console.error('[leagues] could not save', error.message);
    return;
  }

  leagueNameColumn = 'absent';
  console.warn(
    '[leagues] olympus_leagues has no league_name column, so league names will '
      + 'not persist. Run: alter table olympus_leagues add column if not exists league_name text;',
  );
  const stripped = rows.map((row) => {
    const rest = { ...row };
    delete rest.league_name;
    return rest;
  });
  const retry = await supabase
    .from('olympus_leagues')
    .upsert(stripped, { onConflict: 'user_id,provider,league_id' });
  if (retry.error) console.error('[leagues] could not save', retry.error.message);
}

async function saveLeagueRow(userId: string, c: StoredConnection, isActive = true) {
  await upsertRows([leagueRow(userId, c, isActive)]);
}

async function saveLeagueRows(userId: string, connections: StoredConnection[], active: StoredConnection) {
  await supabase.from('olympus_leagues').update({ is_active: false }).eq('user_id', userId);
  await upsertRows(
    connections.map((connection) =>
      leagueRow(userId, connection, leagueKey(connection) === leagueKey(active)),
    ),
  );
}

/** Make one league the active one for the account: clear every flag, then
 *  set this league's. Used on connect (add) and on switch. */
async function activateLeagueRow(userId: string, c: StoredConnection) {
  await supabase.from('olympus_leagues').update({ is_active: false }).eq('user_id', userId);
  await saveLeagueRow(userId, c);
}

export function LeagueConnectionProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredConnection | null>(readStored);
  const [leagues, setLeagues] = useState<StoredConnection[]>(() => {
    const initial = readStored();
    return initial ? [initial] : [];
  });
  const [bootstrap, setBootstrap] = useState<LeagueBootstrap | null>(null);
  const [schedule, setSchedule] = useState<ScheduleWeek[] | null>(null);
  const [pricing, setPricing] = useState<LeaguePricing | null>(null);
  const [pricingMeta, setPricingMeta] = useState(EMPTY_PRICING_META);
  const [lineHistory, setLineHistory] = useState<LineHistoryEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(stored));
  const [error, setError] = useState<string | null>(null);
  const [isScanningMarket, setIsScanningMarket] = useState(false);
  const [lastMarketScanAt, setLastMarketScanAt] = useState<number | null>(
    () => (stored ? readLastMarketScan(stored.leagueId) : null),
  );
  const { user } = useAuth();
  const userIdRef = useRef<string | null>(null);
  /* Leagues removed in this session. See removeLeague: the row delete is async
     and the hydrate that follows would otherwise restore what was just removed. */
  const removedKeysRef = useRef<Set<string>>(new Set());
  const lastHydrateKeyRef = useRef<string | null>(null);
  const pricingRef = useRef<LeaguePricing | null>(null);
  const marketScanPromiseRef = useRef<Promise<LeaguePricing | null> | null>(null);
  pricingRef.current = pricing;
  userIdRef.current = user?.id ?? null;

  useEffect(() => {
    setLastMarketScanAt(stored ? readLastMarketScan(stored.leagueId) : null);
  }, [stored]);

  // Saved leagues live on the account, so they follow you to any device.
  // If this browser already has an active league, keep it. Supabase fills the
  // switcher list, but only the explicit league switcher changes the active row.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('olympus_leagues')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as DbLeagueRow[];
        if (rows.length === 0 && !stored) {
          applyApiContext(null);
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          setLeagues([]);
          setStored(null);
          setBootstrap(null);
          setSchedule(null);
          setPricing(null);
          setPricingMeta(EMPTY_PRICING_META);
          setLineHistory(null);
          setError(null);
          return;
        }
        if (rows.length === 0 && stored) {
          setLeagues([stored]);
          applyApiContext(stored);
          return;
        }
        /* is_active is carried on the connection rather than read back out of
           `rows` by index. The list is filtered a line later, so an index into
           `all` stopped matching the row it came from and the "active" league
           could be somebody else entirely. */
        const all = rows
          .map((row) => ({ ...rowToConnection(row), wasActive: row.is_active }))
          .filter((connection) => !removedKeysRef.current.has(leagueKey(connection)));
        if (all.length === 0 && rows.length > 0) {
          /* Everything the account still lists was removed here a moment ago.
             Treat it as no leagues rather than restoring them. */
          setLeagues([]);
          applyApiContext(null);
          return;
        }
        const localActive = stored
          ? all.find((connection) => leagueKey(connection) === leagueKey(stored))
          : null;
        const leaguesForSwitcher = stored && !localActive
          ? [stored, ...all.filter((connection) => leagueKey(connection) !== leagueKey(stored))]
          : all;
        /* Rows carry no name until the league_name migration has run, and old
           rows carry none after it either. Writing them in raw wiped every name
           in the switcher, and the Sleeper name refresh put them back a second
           later — the two took turns forever, which is what the flashing was.
           A name is only ever replaced by another name. */
        setLeagues((previous) => {
          /* Three sources, weakest last: the rows themselves, then whatever is
             already in memory, then names this device has seen before. The
             cache is what makes a cold API harmless — without it every name in
             the switcher depends on one request succeeding on every load. */
          const merged = applyCachedLeagueNames(
            mergeLeagueNames(leaguesForSwitcher, stored ? [...previous, stored] : previous),
          );
          rememberLeagueNames(merged);
          /* Same list -> same reference, so the name refresh downstream is not
             woken up to redo work it already did. */
          return sameLeagueList(merged, previous) ? previous : merged;
        });

        if (stored) {
          /* The account rows are the source of truth for which leagues exist,
             but they have no column for the things that only live on this
             device: the ESPN cookies, and the identity version stamped when
             the manager picked their team.

             Merging a row over the local copy dropped both. The stamp going
             missing was the visible one: the merge wrote the stripped copy
             straight back to localStorage, so the next refresh saw an
             unstamped ESPN connection, discarded it as untrusted, and fell
             through to whichever Sleeper league came next. Connect, refresh,
             and you are somewhere else. */
          const active = localActive
            ? {
                ...localActive,
                leagueName: stored.leagueName ?? localActive.leagueName,
                allLeagueIds: stored.allLeagueIds.length > 1 ? stored.allLeagueIds : all.map((l) => l.leagueId),
                allLeagues: stored.allLeagues,
                espnS2: stored.espnS2 ?? localActive.espnS2,
                swid: stored.swid ?? localActive.swid,
              }
            : stored;
          applyApiContext(active);
          if (leagueKey(active) === leagueKey(stored) && activeConnectionChanged(stored, active)) {
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
            } catch {
              // ignore
            }
            setStored(active);
          }
          return;
        }

        /* An ESPN league that has not been confirmed on this device cannot be
           opened, because it might be pointing at someone else's team. But it
           must not take the whole account down with it: this used to return
           here, so a person whose active league was an unconfirmed ESPN one
           landed on "sync a league to begin" while holding fourteen leagues.

           Skip what cannot be opened, open the best thing that can. */
        const preferred = all.find((connection) => connection.wasActive) ?? all[0];
        const dbActive = trustedForIdentity(preferred)
          ? preferred
          : all.find((connection) => trustedForIdentity(connection)) ?? null;
        if (preferred && !trustedForIdentity(preferred)) flagIdentityRecheck();
        if (!dbActive) {
          /* Nothing on the account can be opened yet, which means every league
             here is an ESPN one awaiting a team pick. */
          applyApiContext(null);
          return;
        }
        applyApiContext(dbActive);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dbActive));
        } catch {
          // ignore
        }
        if (activeConnectionChanged(null, dbActive)) {
          setStored(dbActive);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stored, user]);

  useEffect(() => {
    /* Names come from Sleeper, not from the account, because the rows have no
       column for one. Gating this on the ACTIVE league being Sleeper meant that
       whenever the active league was ESPN, or there was no active league at
       all, the names never arrived and every Sleeper row in the switcher showed
       the manager's own username instead. The username is on any Sleeper league
       in the list, so take it from there. */
    const sleeperUsername =
      (stored?.provider === 'sleeper' ? stored.username : null)
      ?? leagues.find((league) => league.provider === 'sleeper' && league.username)?.username
      ?? null;
    if (!user || !sleeperUsername) return;
    let cancelled = false;
    connectUsername(sleeperUsername)
      .then((result) => {
        if (cancelled || result.leagues.length === 0) return;
        const summaries = sleeperSummaries(result.leagues);
        /* `stored` may be null here now that this runs without an active
           Sleeper league, so the base is built from the Sleeper account rather
           than spread from whatever happens to be open. */
        const base: StoredConnection = {
          provider: 'sleeper',
          leagueId: '',
          userId: result.user.id,
          username: result.user.username,
          displayName: result.user.displayName,
          allLeagueIds: [],
          season: result.season,
          espnS2: null,
          swid: null,
        };
        const nextConnections = result.leagues.map((league) =>
          connectionFromSummary(
            base,
            { id: league.id, name: league.name, season: league.season },
            summaries,
          ),
        );
        /* Refresh what is already here; never add. Sleeper returns every league
           the account is in, and adopting that list wholesale is why a switcher
           the user never curated filled up with a dozen entries, and why
           removing one came straight back on the next refresh.

           What this IS for is names. The account rows have no column for a
           league name, so a league restored from the account falls back to the
           manager's display name and every Sleeper row reads the same word.
           This is the only place those names can come back from. */
        const nameById = new Map(nextConnections.map((c) => [leagueKey(c), c]));
        const refreshed = leagues.map((league) => {
          const fresh = nameById.get(leagueKey(league));
          return fresh ? { ...league, leagueName: fresh.leagueName, season: fresh.season } : league;
        });
        const active = stored
          ? refreshed.find((connection) => leagueKey(connection) === leagueKey(stored))
          : undefined;
        const changed = refreshed.some(
          (league, index) => league.leagueName !== leagues[index]?.leagueName,
        );
        if (changed) {
          rememberLeagueNames(refreshed);
          setLeagues(refreshed);
          if (userIdRef.current && active) void saveLeagueRows(userIdRef.current, refreshed, active);
        }
        if (active && stored && leagueKey(active) === leagueKey(stored)) {
          const activeChanged =
            active.leagueName !== stored.leagueName ||
            active.allLeagueIds.length !== stored.allLeagueIds.length ||
            active.allLeagueIds.some((id, index) => id !== stored.allLeagueIds[index]);
          if (activeChanged) {
            applyApiContext(active);
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
            } catch {
              // ignore
            }
            setStored(active);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [leagues, stored, user]);

  const applyPricingSnapshot = useCallback(
    (
      snapshot: CachedLeaguePricingSnapshot,
      meta?: Partial<typeof EMPTY_PRICING_META>,
    ) => {
      setPricing(snapshot.pricing);
      setLineHistory(snapshot.lineHistory);
      setPricingMeta({
        ...EMPTY_PRICING_META,
        hasResolved: true,
        lastUpdatedAt: snapshot.pricing.computedAt ?? snapshot.updatedAt,
        ...meta,
      });
    },
    [],
  );

  const revalidatePricing = useCallback(
    async (
      connection: StoredConnection,
      options?: {
        week?: number | null;
        retry?: boolean;
        silent?: boolean;
      },
    ) => {
      const hasExistingData = Boolean(pricingRef.current);
      setPricingMeta((current) => ({
        ...current,
        isFetching: true,
        isStale: hasExistingData || current.isStale,
      }));

      const delays = options?.retry ? [0, 4_000] : [0];
      let lastError: unknown = null;

      for (const delay of delays) {
        if (delay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        try {
          const snapshot = await fetchLeaguePricingSnapshot(connection, {
            expectedWeek: options?.week ?? null,
          });
          const currentPricing = pricingRef.current;
          const shouldKeepExisting =
            hasExistingData &&
            currentPricing?.available &&
            (
              !snapshot.pricing.available ||
              (hasSuggestionPayload(currentPricing) && !hasSuggestionPayload(snapshot.pricing))
            );

          if (!shouldKeepExisting) {
            applyPricingSnapshot(snapshot);
          } else {
            setPricingMeta((current) => ({
              ...current,
              isFetching: false,
              isStale: true,
              hasResolved: true,
            }));
          }
          return snapshot.pricing;
        } catch (caught) {
          lastError = caught;
        }
      }

      if (pricingRef.current) {
        setPricingMeta((current) => ({
          ...current,
          isFetching: false,
          isStale: true,
          hasResolved: true,
        }));
        return pricingRef.current;
      }

      setPricing({ available: false, reason: 'pricing_timeout' });
      setLineHistory(null);
      setPricingMeta({
        ...EMPTY_PRICING_META,
        hasResolved: true,
      });
      if (!options?.silent && lastError instanceof Error) {
        setError((current) => current ?? lastError.message);
      }
      return null;
    },
    [applyPricingSnapshot],
  );

  const hydrate = useCallback(async (connection: StoredConnection) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchBootstrap(connection.leagueId, connection.userId);
      setBootstrap(data);

      /* Learn the league's real name from the league itself.
         Names used to arrive from one place only — a Sleeper account lookup —
         so an ESPN league never got one and sat in the switcher under the
         manager's own name forever. Andre's ESPN row read "Andre Vlahakis".
         The bootstrap knows what the league is called whatever host it came
         from, and it has already been fetched, so this costs nothing and works
         for both providers. Guarded on the id because a bootstrap in flight
         during a switch belongs to the PREVIOUS league, and writing its name
         onto the new one is how a Sleeper league ends up labelled with an ESPN
         league's name. */
      const learnedName = data.league?.name;
      if (learnedName && String(data.league.id) === String(connection.leagueId)) {
        /* Written down before it is rendered, because this is the ONLY place an
           ESPN league's name ever comes from: the Sleeper account lookup that
           names everything else knows nothing about ESPN. Without this, Andre's
           ESPN row read "Andre Vlahakis" on every load forever. */
        rememberLeagueNames([{ ...connection, leagueName: learnedName }]);
        setLeagues((previous) =>
          previous.map((league) =>
            leagueKey(league) === leagueKey(connection) && league.leagueName !== learnedName
              ? { ...league, leagueName: learnedName }
              : league,
          ),
        );
        setStored((previous) => {
          if (!previous || leagueKey(previous) !== leagueKey(connection)) return previous;
          if (previous.leagueName === learnedName) return previous;
          const next = { ...previous, leagueName: learnedName };
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
      const cachedPricing = readCachedLeaguePricing(connection, data.week);
      if (cachedPricing) {
        applyPricingSnapshot(cachedPricing, {
          isFetching: true,
          isStale: true,
        });
      } else {
        setPricing(null);
        setLineHistory(null);
        setPricingMeta({
          ...EMPTY_PRICING_META,
          isFetching: true,
        });
      }
      fetchSchedule(connection.leagueId)
        .then((s) => setSchedule(s.weeks))
        .catch(() => setSchedule(null));
      void revalidatePricing(connection, { week: data.week, retry: true, silent: true });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load your league. Try again in a minute.',
      );
      setBootstrap(null);
    } finally {
      setIsLoading(false);
    }
  }, [applyPricingSnapshot, revalidatePricing]);

  useEffect(() => {
    if (!stored) {
      lastHydrateKeyRef.current = null;
      setPricingMeta(EMPTY_PRICING_META);
      return;
    }
    const key = hydrateKey(stored);
    if (lastHydrateKeyRef.current === key) return;
    lastHydrateKeyRef.current = key;
    void hydrate(stored);
  }, [stored, hydrate]);

  /** Make a connection the active league locally (api context + cache + state). */
  const activateLocal = useCallback((connection: StoredConnection) => {
    applyApiContext(connection);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
    } catch {
      // private mode: connection lives for the session only
    }
    setBootstrap(null);
    setSchedule(null);
    setPricing(null);
    setPricingMeta(EMPTY_PRICING_META);
    setLineHistory(null);
    setError(null);
    setIsLoading(true);
    setStored(connection);
  }, []);

  // Add a league (or re-sync an existing one) and make it active.
  const connect = useCallback(
    (incoming: StoredConnection) => {
      /* Reconnecting a league you removed has to un-tombstone it, or the
         hydrate would keep filtering out the thing you just added. */
      removedKeysRef.current.delete(leagueKey(incoming));
      /* Recorded on the way in. Connecting an ESPN league means the team was
         either matched to your own cookie or picked by you from the list, and
         both are confirmations. Recorded by league id rather than stamped on
         the object, so it survives the connection being rebuilt from account
         rows or handed around by the switcher. */
      if (incoming.provider === 'espn') confirmEspnLeague(incoming.leagueId);
      const connection: StoredConnection = incoming;
      const knownConnections = connectionsFromKnownLeagues(connection);
      const active =
        knownConnections.find((known) => leagueKey(known) === leagueKey(connection)) ??
        connection;
      activateLocal(active);
      setLeagues((prev) => {
        const merged = [
          ...knownConnections,
          ...prev.filter((l) => !knownConnections.some((known) => leagueKey(known) === leagueKey(l))),
        ];
        /* Same rule as the rehydrate: a name is only ever replaced by another
           name. Connect paths normally carry names, so this is a guard rather
           than a fix — but it is the one invariant that stops this field from
           being clobbered, and it is worth holding everywhere rather than in
           the one place it has already gone wrong. */
        const named = mergeLeagueNames(merged, prev);
        rememberLeagueNames(named);
        return named;
      });
      // Persist to the account so it's there on every device.
      if (userIdRef.current) void saveLeagueRows(userIdRef.current, knownConnections, active);
    },
    [activateLocal],
  );

  // Switch the active league to another one already saved on the account.
  const switchLeague = useCallback(
    (provider: StoredConnection['provider'], leagueId: string) => {
      const target = leagues.find(
        (l) => l.provider === provider && l.leagueId === leagueId,
      );
      if (!target || (stored && leagueKey(target) === leagueKey(stored))) return;
      activateLocal(target);
      if (userIdRef.current) void activateLeagueRow(userIdRef.current, target);
    },
    [leagues, stored, activateLocal],
  );

  /**
   * Drop one league from the account.
   *
   * `disconnect` could only ever remove whichever league you happened to be
   * looking at, so getting rid of a stale league meant switching into it
   * first. Taking the league as an argument makes the switcher able to manage
   * the list rather than only reorder it; `disconnect` becomes the special
   * case where the league is the active one.
   */
  const removeLeague = useCallback((target: StoredConnection | null) => {
    const removing = target;
    /* Tombstone it before anything else. Removing a league clears `stored`,
       which re-runs the hydrate effect, which re-reads the account rows. The
       delete below is a network call that has not landed yet, so the rows still
       list the league and it comes straight back: remove it and it reappears.
       The row delete is the durable fix; this is what makes the removal stick
       in the second before the delete commits. */
    if (removing) removedKeysRef.current.add(leagueKey(removing));
    const remaining = removing
      ? leagues.filter((l) => leagueKey(l) !== leagueKey(removing))
      : leagues;

    if (userIdRef.current && removing) {
      void supabase
        .from('olympus_leagues')
        .delete()
        .eq('user_id', userIdRef.current)
        .eq('provider', removing.provider)
        .eq('league_id', removing.leagueId);
    }

    setLeagues(remaining);

    const next = remaining[0] ?? null;
    if (next) {
      // Fall through to the next saved league instead of dropping to nothing.
      activateLocal(next);
      if (userIdRef.current) void activateLeagueRow(userIdRef.current, next);
      return;
    }

    applyApiContext(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setStored(null);
    setBootstrap(null);
    setSchedule(null);
    setPricing(null);
    setPricingMeta(EMPTY_PRICING_META);
    setLineHistory(null);
    setError(null);
  }, [leagues, activateLocal]);

  const disconnect = useCallback(() => removeLeague(stored), [removeLeague, stored]);

  /* Forget the team and drop the league out of the active slot. The connect
     flow already draws the picker for an ESPN league with nothing confirmed,
     so this reuses the path that works rather than inventing a second one. */
  const changeEspnTeam = useCallback((league: StoredConnection) => {
    if (league.provider !== 'espn') return;
    forgetEspnLeague(league.leagueId);
    if (stored && leagueKey(stored) === leagueKey(league)) {
      applyApiContext(null);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setStored(null);
      setBootstrap(null);
      setSchedule(null);
      setPricing(null);
      setPricingMeta(EMPTY_PRICING_META);
      setLineHistory(null);
      setError(null);
    }
  }, [stored]);

  /**
   * Freshness loop: keep background repricing slow and deliberate so a tab
   * sitting open does not keep hammering the long-running market endpoint.
   */
  useEffect(() => {
    if (!stored) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      let delay = 60 * 60_000;

      try {
        const health = await fetch(apiUrl('/api/health')).then((r) => r.json());
        delay = health.gameWindow ? 5 * 60_000 : 60 * 60_000;

        const data = await fetchBootstrap(stored.leagueId, stored.userId);
        if (cancelled) return;
        setBootstrap(data);
        await revalidatePricing(stored, { week: data.week, silent: true });
      } catch {
        // keep showing the last good data; try again next cycle
      }

      if (!cancelled) {
        timer = window.setTimeout(() => void tick(), delay);
      }
    };

    timer = window.setTimeout(() => void tick(), 5 * 60_000);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [revalidatePricing, stored]);

  // When the user's model (BYOR overlay) changes, reprice the book so the
  // matchup and season tabs reflect their numbers. Debounced: rapid dragging
  // shouldn't fire a sim per tick. The overlay header is already set by the
  // model context, so a plain re-fetch picks it up.
  const didOverlayMount = useRef(false);
  useEffect(() => {
    if (!stored) return undefined;
    if (!didOverlayMount.current) {
      didOverlayMount.current = true;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void revalidatePricing(stored, { week: bootstrap?.week ?? pricingRef.current?.week ?? null, silent: true });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [bootstrap?.week, revalidatePricing, stored]);

  const refresh = useCallback(async () => {
    if (!stored) return;
    await refreshLeague(stored.leagueId).catch(() => null);
    await hydrate(stored);
  }, [stored, hydrate]);

  // ── live in-game mode ──
  // The admin flips live mode on before a game window. The client polls whether
  // it's on, and while it is, re-fetches pricing every 30s so the matchup win% and
  // futures update in-game. Off = no polling, so the app is unchanged.
  const [liveMode, setLiveMode] = useState<{ on: boolean; at: number }>({ on: false, at: 0 });
  useEffect(() => {
    let alive = true;
    const check = () => {
      void fetchLiveStatus().then((s) => {
        if (alive && s) setLiveMode({ on: s.on, at: s.at });
      });
    };
    check();
    const t = window.setInterval(check, 45_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!liveMode.on || !stored) return undefined;
    const t = window.setInterval(() => {
      void revalidatePricing(stored, {
        week: bootstrap?.week ?? pricingRef.current?.week ?? null,
        silent: true,
      });
    }, 30_000);
    return () => window.clearInterval(t);
  }, [liveMode.on, stored, bootstrap?.week, revalidatePricing]);

  const scanMarket = useCallback(async () => {
    if (!stored) return null;
    if (marketScanPromiseRef.current) return marketScanPromiseRef.current;
    if (
      lastMarketScanAt != null &&
      Date.now() - lastMarketScanAt < MARKET_SCAN_COOLDOWN_MS
    ) {
      return pricing;
    }

    setIsScanningMarket(true);
    const promise = revalidatePricing(stored, {
      week: bootstrap?.week ?? pricingRef.current?.week ?? null,
      silent: true,
    })
      .then((lines) => {
        const completedAt = Date.now();
        writeLastMarketScan(stored.leagueId, completedAt);
        setLastMarketScanAt(completedAt);
        return lines;
      })
      .catch(() => pricing)
      .finally(() => {
        marketScanPromiseRef.current = null;
        setIsScanningMarket(false);
      });
    marketScanPromiseRef.current = promise;
    return promise;
  }, [bootstrap?.week, lastMarketScanAt, pricing, revalidatePricing, stored]);

  const value = useMemo(
    () => ({
      stored,
      leagues,
      bootstrap,
      schedule,
      pricing,
      pricingMeta,
      lineHistory,
      isLoading,
      error,
      connect,
      switchLeague,
      disconnect,
      removeLeague,
      changeEspnTeam,
      refresh,
      liveMode,
      marketScan: {
        isScanning: isScanningMarket,
        lastScannedAt: lastMarketScanAt,
        cooldownMs: MARKET_SCAN_COOLDOWN_MS,
      },
      scanMarket,
    }),
    [
      stored,
      leagues,
      bootstrap,
      schedule,
      pricing,
      pricingMeta,
      lineHistory,
      isLoading,
      error,
      connect,
      switchLeague,
      disconnect,
      removeLeague,
      changeEspnTeam,
      refresh,
      liveMode,
      isScanningMarket,
      lastMarketScanAt,
      scanMarket,
    ],
  );

  return (
    <LeagueConnectionContext.Provider value={value}>
      {children}
    </LeagueConnectionContext.Provider>
  );
}

export function useLeagueConnection() {
  const context = useContext(LeagueConnectionContext);

  if (!context) {
    throw new Error('useLeagueConnection must be used within LeagueConnectionProvider');
  }

  return context;
}
