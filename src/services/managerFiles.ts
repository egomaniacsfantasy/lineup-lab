import type { ApiTeam } from './leagueApi';
import { PERSONA_RULES } from '../utils/personaRules';

const BASE = 'https://api.sleeper.app/v1';
const CACHE_VERSION = '2026-07-14-v3';

type Provider = 'sleeper' | 'espn';

interface SleeperLeague {
  league_id?: string;
  name?: string;
  season?: string;
  status?: string;
  previous_league_id?: string | number | null;
  settings?: {
    type?: number;
    playoff_week_start?: number;
    waiver_budget?: number;
  };
}

interface SleeperRoster {
  roster_id: number;
  owner_id?: string | null;
  players?: string[];
  starters?: string[];
  settings?: {
    wins?: number;
    losses?: number;
    ties?: number;
    total_moves?: number;
    waiver_budget_used?: number;
  };
  metadata?: {
    team_name?: string;
  };
}

interface SleeperDraftPick {
  owner_id?: string | null;
  previous_owner_id?: string | null;
  roster_id?: number;
}

interface SleeperTransaction {
  status?: string | null;
  type?: string | null;
  creator?: string | null;
  consenter_ids?: string[];
  roster_ids?: number[];
  adds?: Record<string, number>;
  draft_picks?: SleeperDraftPick[];
  settings?: {
    waiver_bid?: number;
  };
}

interface SleeperBracketMatchup {
  t1?: number;
  t2?: number;
  w?: number;
  l?: number;
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points?: number;
  players?: string[];
  starters?: string[];
  players_points?: Record<string, number>;
}

interface TenureSummary {
  seasonsActive: number;
  totalLeagues: number;
  firstSeason: number | null;
  leagueIds: string[];
}

interface CareerSummary extends TenureSummary {
  careerRecord: string | null;
  playoffRate: number | null;
  titles: number | null;
  inspectedLeagues: number;
}

interface LineageAggregate {
  seasons: number;
  regularWeeks: number;
  trades: number;
  initiatedTrades: number;
  consentedTrades: number;
  waiverAdds: number;
  faabSpent: number;
  earlyFaabSpent: number;
  picksTraded: number;
  titles: number;
}

interface LineageSeasonStats {
  season: number;
  leagueId: string;
  regularWeeks: number;
  trades: number;
  initiatedTrades: number;
  consentedTrades: number;
  waiverAdds: number;
  faabSpent: number;
  earlyFaabSpent: number;
  picksTraded: number;
  titles: number;
}

interface TradeHistoryEntry {
  season: number;
  managerIds: string[];
}

interface SharedLineageEntry {
  leagueId: string;
  season: number;
  regularWeeks: number;
  rosters: SleeperRoster[];
  rosterByOwner: Map<string, SleeperRoster>;
  seasonStatsByManager: Map<string, LineageSeasonStats>;
  tradeHistory: TradeHistoryEntry[];
}

interface SharedLeagueData {
  leagueId: string;
  currentLeague: SleeperLeague;
  lineupPointsConfirmed: boolean;
  lineage: SharedLineageEntry[];
  aggregates: Map<string, LineageAggregate>;
  waiverQuartiles: { low: number; high: number };
  currentWeek: number;
}

export interface ManagerChip {
  key: string;
  label: string;
  receipt: string;
  threshold: string;
}

export interface ManagerReadDefaults {
  friendliness: number;
  relationship: number;
  sourceLabel: string;
  rationale: string;
  friendlinessReceipt: string;
  relationshipReceipt: string;
}

export interface ManagerFileNumbers {
  tradesPerSeason: number | null;
  tradeInitiationRate: number | null;
  waiverAddsPerWeek: number | null;
  faabUsed: number | null;
  careerRecord: string | null;
  playoffRate: number | null;
  titles: number | null;
  headToHeadRecord: string | null;
  benchPointsLeftPerWeek: number | null;
}

export interface ManagerFileScopes {
  lineage: string;
  career: string;
  headToHead: string;
  bench: string;
}

export interface ManagerFile {
  version: string;
  provider: Provider;
  managerKey: string;
  /* null when the provider has no printable name for the manager. */
  managerName: string | null;
  teamName: string;
  rosterId: number | null;
  avatarUrl: string | null;
  record: string;
  fileTag: 'THE FILE' | 'THIN FILE' | 'MANUAL FILE' | null;
  status: 'full' | 'thin' | 'manual' | 'unmanaged';
  tenureLine: string;
  chips: ManagerChip[];
  numbers: ManagerFileNumbers;
  scopes: ManagerFileScopes;
  bookRead: string;
  notes: string[];
  compiledAt: number;
  readDefaults: ManagerReadDefaults;
}

interface CompileManagerFileArgs {
  provider: Provider;
  leagueId: string;
  managerTeam: ApiTeam;
  viewerUserId: string;
  currentWeek: number;
  force?: boolean;
}

interface PersonaMetrics {
  lineageSeasons: number;
  weightedTradesPerSeason: number | null;
  rawTradesPerSeason: number | null;
  weightedConsentedTradesPerSeason: number | null;
  tradeInitiationRate: number | null;
  waiverAddsPerWeek: number | null;
  priorDealingsCount: number;
  priorDealingsSeasons: number[];
}

const fileCache = new Map<string, Promise<ManagerFile>>();
const sharedLeagueCache = new Map<string, Promise<SharedLeagueData>>();
const tenureCache = new Map<string, Promise<TenureSummary>>();
const careerCache = new Map<string, Promise<CareerSummary>>();
const jsonCache = new Map<string, Promise<unknown | null>>();

let compileQueue = Promise.resolve();

function queueCompile<T>(task: () => Promise<T>) {
  const next = compileQueue.then(task, task);
  compileQueue = next.then(() => undefined, () => undefined);
  return next;
}

function storageKey(leagueId: string, managerKey: string) {
  return `og.manager.file.${CACHE_VERSION}.${leagueId}.${managerKey}`;
}

function sharedStorageKey(leagueId: string) {
  return `og.manager.shared.${CACHE_VERSION}.${leagueId}`;
}

function clampRead(value: number) {
  return Math.max(
    PERSONA_RULES.sliderRange.min,
    Math.min(PERSONA_RULES.sliderRange.max, Math.round(value)),
  );
}

function round(value: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function percent(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return Number((value * 100).toFixed(0));
}

function average(total: number, count: number, digits = 2) {
  if (!count) return null;
  return Number((total / count).toFixed(digits));
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function recordLabel(wins = 0, losses = 0, ties = 0) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function leagueType(league: SleeperLeague | null | undefined) {
  if (league?.settings?.type === 2) return 'dynasty';
  if (league?.settings?.type === 1) return 'keeper';
  return 'redraft';
}

function regularSeasonWeeks(league: SleeperLeague | null | undefined) {
  const playoffStart = Number(league?.settings?.playoff_week_start ?? 0);
  return playoffStart > 1 ? playoffStart - 1 : 14;
}

function recencyWeight(index: number) {
  if (index === 0) return PERSONA_RULES.recencyWeights.currentSeason;
  if (index === 1) return PERSONA_RULES.recencyWeights.previousSeason;
  return PERSONA_RULES.recencyWeights.olderSeasons;
}

function newAggregate(): LineageAggregate {
  return {
    seasons: 0,
    regularWeeks: 0,
    trades: 0,
    initiatedTrades: 0,
    consentedTrades: 0,
    waiverAdds: 0,
    faabSpent: 0,
    earlyFaabSpent: 0,
    picksTraded: 0,
    titles: 0,
  };
}

function newSeasonStats(season: number, leagueId: string, regularWeeksValue: number): LineageSeasonStats {
  return {
    season,
    leagueId,
    regularWeeks: regularWeeksValue,
    trades: 0,
    initiatedTrades: 0,
    consentedTrades: 0,
    waiverAdds: 0,
    faabSpent: 0,
    earlyFaabSpent: 0,
    picksTraded: 0,
    titles: 0,
  };
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function formatSeasonList(seasons: number[]) {
  if (seasons.length === 0) return 'no prior seasons';
  const ordered = [...new Set(seasons)].sort((a, b) => a - b);
  if (ordered.length === 1) return String(ordered[0]);
  if (ordered.length === 2) return `${ordered[0]} and ${ordered[1]}`;
  return `${ordered.slice(0, -1).join(', ')}, and ${ordered.at(-1)}`;
}

async function sleeperGet<T>(endpoint: string): Promise<T | null> {
  if (!jsonCache.has(endpoint)) {
    jsonCache.set(
      endpoint,
      (async () => {
        const response = await fetch(`${BASE}${endpoint}`);
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Sleeper ${endpoint} responded ${response.status}`);
        return response.json();
      })(),
    );
  }
  return (await jsonCache.get(endpoint)) as T | null;
}

function readCachedFile(leagueId: string, managerKey: string) {
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId, managerKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManagerFile;
    return parsed.version === CACHE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function saveCachedFile(leagueId: string, file: ManagerFile) {
  try {
    window.localStorage.setItem(storageKey(leagueId, file.managerKey), JSON.stringify(file));
  } catch {
    // ignore
  }
}

function readCachedSharedLeagueData(leagueId: string) {
  try {
    const raw = window.localStorage.getItem(sharedStorageKey(leagueId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      leagueId: string;
      currentLeague: SleeperLeague;
      lineupPointsConfirmed: boolean;
      currentWeek: number;
      waiverQuartiles: { low: number; high: number };
      lineage: Array<{
        leagueId: string;
        season: number;
        regularWeeks: number;
        rosters: SleeperRoster[];
        tradeHistory: TradeHistoryEntry[];
        seasonStatsByManager: Array<[string, LineageSeasonStats]>;
      }>;
      aggregates: Array<[string, LineageAggregate]>;
    };
    return {
      leagueId: parsed.leagueId,
      currentLeague: parsed.currentLeague,
      lineupPointsConfirmed: parsed.lineupPointsConfirmed,
      currentWeek: parsed.currentWeek,
      waiverQuartiles: parsed.waiverQuartiles,
      lineage: parsed.lineage.map((entry) => ({
        leagueId: entry.leagueId,
        season: entry.season,
        regularWeeks: entry.regularWeeks,
        rosters: entry.rosters,
        rosterByOwner: new Map(
          entry.rosters
            .filter((roster) => roster.owner_id)
            .map((roster) => [String(roster.owner_id), roster]),
        ),
        tradeHistory: entry.tradeHistory,
        seasonStatsByManager: new Map(entry.seasonStatsByManager),
      })),
      aggregates: new Map(parsed.aggregates),
    } satisfies SharedLeagueData;
  } catch {
    return null;
  }
}

function saveCachedSharedLeagueData(shared: SharedLeagueData) {
  try {
    window.localStorage.setItem(
      sharedStorageKey(shared.leagueId),
      JSON.stringify({
        leagueId: shared.leagueId,
        currentLeague: shared.currentLeague,
        lineupPointsConfirmed: shared.lineupPointsConfirmed,
        currentWeek: shared.currentWeek,
        waiverQuartiles: shared.waiverQuartiles,
        lineage: shared.lineage.map((entry) => ({
          leagueId: entry.leagueId,
          season: entry.season,
          regularWeeks: entry.regularWeeks,
          rosters: entry.rosters,
          tradeHistory: entry.tradeHistory,
          seasonStatsByManager: [...entry.seasonStatsByManager.entries()],
        })),
        aggregates: [...shared.aggregates.entries()],
      }),
    );
  } catch {
    // ignore
  }
}

function findChampionRosterId(winnersBracket: SleeperBracketMatchup[] | null) {
  if (!Array.isArray(winnersBracket) || winnersBracket.length === 0) return null;
  const winnerIds = new Set(
    winnersBracket.flatMap((matchup) => [matchup.w, matchup.t1, matchup.t2]).filter(Boolean) as number[],
  );
  const loserIds = new Set(
    winnersBracket.flatMap((matchup) => [matchup.l]).filter(Boolean) as number[],
  );
  for (const rosterId of winnerIds) {
    if (!loserIds.has(rosterId)) return rosterId;
  }
  return winnersBracket.at(-1)?.w ?? null;
}

async function loadSharedLeagueData(leagueId: string, currentWeek: number) {
  const cacheKey = leagueId;
  if (!sharedLeagueCache.has(cacheKey)) {
    const persisted = readCachedSharedLeagueData(leagueId);
    if (persisted) {
      persisted.currentWeek = currentWeek;
      sharedLeagueCache.set(cacheKey, Promise.resolve(persisted));
      return sharedLeagueCache.get(cacheKey)!;
    }
    sharedLeagueCache.set(
      cacheKey,
      queueCompile(async () => {
        const currentLeague = await sleeperGet<SleeperLeague>(`/league/${leagueId}`);
        if (!currentLeague) throw new Error('league_not_found');

        const lineage: SharedLineageEntry[] = [];
        let nextId: string | null = leagueId;
        const seen = new Set<string>();

        while (nextId && nextId !== '0' && !seen.has(nextId)) {
          seen.add(nextId);
          const league: SleeperLeague | null =
            nextId === leagueId ? currentLeague : await sleeperGet<SleeperLeague>(`/league/${nextId}`);
          if (!league) break;
          const rosters = (await sleeperGet<SleeperRoster[]>(`/league/${nextId}/rosters`)) ?? [];
          const regularWeeksValue = regularSeasonWeeks(league);
          const seasonStatsByManager = new Map<string, LineageSeasonStats>();
          for (const roster of rosters) {
            if (!roster.owner_id) continue;
            seasonStatsByManager.set(
              String(roster.owner_id),
              newSeasonStats(Number(league.season ?? new Date().getFullYear()), nextId, regularWeeksValue),
            );
          }
          lineage.push({
            leagueId: nextId,
            season: Number(league.season ?? new Date().getFullYear()),
            regularWeeks: regularWeeksValue,
            rosters,
            rosterByOwner: new Map(
              rosters
                .filter((roster) => roster.owner_id)
                .map((roster) => [String(roster.owner_id), roster]),
            ),
            seasonStatsByManager,
            tradeHistory: [],
          });
          nextId = league.previous_league_id ? String(league.previous_league_id) : null;
        }

        const aggregates = new Map<string, LineageAggregate>();
        for (const entry of lineage) {
          for (const roster of entry.rosters) {
            if (!roster.owner_id) continue;
            const key = String(roster.owner_id);
            const aggregate = aggregates.get(key) ?? newAggregate();
            aggregate.seasons += 1;
            aggregate.regularWeeks += entry.regularWeeks;
            aggregates.set(key, aggregate);
          }

          const winnersBracket = await sleeperGet<SleeperBracketMatchup[]>(`/league/${entry.leagueId}/winners_bracket`);
          const championRosterId = findChampionRosterId(winnersBracket);
          if (championRosterId != null) {
            const champion = entry.rosters.find((roster) => roster.roster_id === championRosterId);
            if (champion?.owner_id) {
              const key = String(champion.owner_id);
              const aggregate = aggregates.get(key) ?? newAggregate();
              aggregate.titles += 1;
              aggregates.set(key, aggregate);
              const seasonStats = entry.seasonStatsByManager.get(key);
              if (seasonStats) seasonStats.titles += 1;
            }
          }

          for (let week = 1; week <= 18; week += 1) {
            const transactions = (await sleeperGet<SleeperTransaction[]>(`/league/${entry.leagueId}/transactions/${week}`)) ?? [];
            for (const txn of transactions) {
              if (txn.status && txn.status !== 'complete') continue;

              if (txn.type === 'trade') {
                const involvedManagers = new Set(
                  (txn.roster_ids ?? [])
                    .map((rosterId) => entry.rosters.find((roster) => roster.roster_id === rosterId)?.owner_id)
                    .filter(Boolean)
                    .map(String),
                );
                for (const managerKey of involvedManagers) {
                  const aggregate = aggregates.get(managerKey) ?? newAggregate();
                  aggregate.trades += 1;
                  aggregates.set(managerKey, aggregate);
                  const seasonStats = entry.seasonStatsByManager.get(managerKey);
                  if (seasonStats) seasonStats.trades += 1;
                }
                entry.tradeHistory.push({ season: entry.season, managerIds: [...involvedManagers] });
                if (txn.creator) {
                  const key = String(txn.creator);
                  const aggregate = aggregates.get(key) ?? newAggregate();
                  aggregate.initiatedTrades += 1;
                  aggregates.set(key, aggregate);
                  const seasonStats = entry.seasonStatsByManager.get(key);
                  if (seasonStats) seasonStats.initiatedTrades += 1;
                }
                for (const consenterId of txn.consenter_ids ?? []) {
                  const key = String(consenterId);
                  if (txn.creator && key === String(txn.creator)) continue;
                  const aggregate = aggregates.get(key) ?? newAggregate();
                  aggregate.consentedTrades += 1;
                  aggregates.set(key, aggregate);
                  const seasonStats = entry.seasonStatsByManager.get(key);
                  if (seasonStats) seasonStats.consentedTrades += 1;
                }
                for (const draftPick of txn.draft_picks ?? []) {
                  const keys = new Set(
                    [
                      draftPick.owner_id,
                      draftPick.previous_owner_id,
                      draftPick.roster_id != null
                        ? entry.rosters.find((roster) => roster.roster_id === draftPick.roster_id)?.owner_id
                        : null,
                    ]
                      .filter(Boolean)
                      .map(String),
                  );
                  for (const key of keys) {
                    const aggregate = aggregates.get(key) ?? newAggregate();
                    aggregate.picksTraded += 1;
                    aggregates.set(key, aggregate);
                    const seasonStats = entry.seasonStatsByManager.get(key);
                    if (seasonStats) seasonStats.picksTraded += 1;
                  }
                }
              }

              if (txn.type === 'waiver' || txn.type === 'free_agent') {
                for (const rosterId of Object.values(txn.adds ?? {})) {
                  const managerKey = entry.rosters.find((roster) => roster.roster_id === rosterId)?.owner_id;
                  if (!managerKey) continue;
                  const aggregate = aggregates.get(String(managerKey)) ?? newAggregate();
                  aggregate.waiverAdds += 1;
                  const seasonStats = entry.seasonStatsByManager.get(String(managerKey));
                  if (seasonStats) seasonStats.waiverAdds += 1;
                  if (txn.type === 'waiver') {
                    const bid = Number(txn.settings?.waiver_bid ?? 0);
                    aggregate.faabSpent += bid;
                    if (week <= 4) aggregate.earlyFaabSpent += bid;
                    if (seasonStats) {
                      seasonStats.faabSpent += bid;
                      if (week <= 4) seasonStats.earlyFaabSpent += bid;
                    }
                  }
                  aggregates.set(String(managerKey), aggregate);
                }
              }
            }
          }
        }

        const waiverRates = [...aggregates.values()]
          .map((aggregate) => average(aggregate.waiverAdds, aggregate.regularWeeks, 3) ?? 0)
          .sort((a, b) => a - b);
        const currentMatchups = (await sleeperGet<SleeperMatchup[]>(`/league/${leagueId}/matchups/1`)) ?? [];
        const lineupPointsConfirmed = currentMatchups.some(
          (matchup) => matchup.players_points && Object.keys(matchup.players_points).length > 0,
        );

        const shared = {
          leagueId,
          currentLeague,
          lineage,
          aggregates,
          currentWeek,
          lineupPointsConfirmed,
          waiverQuartiles: {
            low: percentile(waiverRates, 0.25),
            high: percentile(waiverRates, 0.75),
          },
        } satisfies SharedLeagueData;
        saveCachedSharedLeagueData(shared);
        return shared;
      }),
    );
  }
  return sharedLeagueCache.get(cacheKey)!.then((shared) => {
    shared.currentWeek = currentWeek;
    return shared;
  });
}

async function loadTenure(managerId: string) {
  if (!tenureCache.has(managerId)) {
    tenureCache.set(
      managerId,
      queueCompile(async () => {
        const leagueIds: string[] = [];
        let seasonsActive = 0;
        let firstSeason: number | null = null;
        for (let season = 2017; season <= 2026; season += 1) {
          const leagues = (await sleeperGet<Array<{ league_id: string }>>(`/user/${managerId}/leagues/nfl/${season}`)) ?? [];
          if (leagues.length > 0) {
            seasonsActive += 1;
            firstSeason = firstSeason ?? season;
            for (const league of leagues) leagueIds.push(String(league.league_id));
          }
        }
        return {
          seasonsActive,
          totalLeagues: leagueIds.length,
          firstSeason,
          leagueIds,
        } satisfies TenureSummary;
      }),
    );
  }
  return tenureCache.get(managerId)!;
}

async function loadCareer(managerId: string) {
  if (!careerCache.has(managerId)) {
    careerCache.set(
      managerId,
      queueCompile(async () => {
        const tenure = await loadTenure(managerId);
        let wins = 0;
        let losses = 0;
        let ties = 0;
        let titles = 0;
        let playoffAppearances = 0;
        let inspectedLeagues = 0;

        for (const leagueId of tenure.leagueIds) {
          const rosters = (await sleeperGet<SleeperRoster[]>(`/league/${leagueId}/rosters`)) ?? [];
          const roster = rosters.find((item) => String(item.owner_id ?? '') === managerId);
          if (!roster) continue;
          wins += Number(roster.settings?.wins ?? 0);
          losses += Number(roster.settings?.losses ?? 0);
          ties += Number(roster.settings?.ties ?? 0);
          inspectedLeagues += 1;

          const winnersBracket = await sleeperGet<SleeperBracketMatchup[]>(`/league/${leagueId}/winners_bracket`);
          if (Array.isArray(winnersBracket) && winnersBracket.some((matchup) => matchup.t1 === roster.roster_id || matchup.t2 === roster.roster_id || matchup.w === roster.roster_id)) {
            playoffAppearances += 1;
          }
          if (findChampionRosterId(winnersBracket) === roster.roster_id) {
            titles += 1;
          }
        }

        return {
          ...tenure,
          careerRecord: inspectedLeagues > 0 ? recordLabel(wins, losses, ties) : null,
          playoffRate: inspectedLeagues > 0 ? playoffAppearances / inspectedLeagues : null,
          titles: inspectedLeagues > 0 ? titles : null,
          inspectedLeagues,
        } satisfies CareerSummary;
      }),
    );
  }
  return careerCache.get(managerId)!;
}

async function loadHeadToHead(
  shared: SharedLeagueData,
  viewerUserId: string,
  managerUserId: string,
) {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (const entry of shared.lineage) {
    const you = entry.rosterByOwner.get(viewerUserId);
    const them = entry.rosterByOwner.get(managerUserId);
    if (!you || !them || you.roster_id === them.roster_id) continue;

    const maxWeek =
      entry.season === Number(shared.currentLeague.season ?? entry.season)
        ? Math.max(0, Math.min(shared.currentWeek - 1, entry.regularWeeks))
        : entry.regularWeeks;

    for (let week = 1; week <= maxWeek; week += 1) {
      const matchups = (await sleeperGet<SleeperMatchup[]>(`/league/${entry.leagueId}/matchups/${week}`)) ?? [];
      const yourMatchup = matchups.find((matchup) => matchup.roster_id === you.roster_id);
      const theirMatchup = matchups.find((matchup) => matchup.roster_id === them.roster_id);
      if (!yourMatchup || !theirMatchup || yourMatchup.matchup_id !== theirMatchup.matchup_id) continue;
      const yourPoints = Number(yourMatchup.points ?? 0);
      const theirPoints = Number(theirMatchup.points ?? 0);
      if (yourPoints > theirPoints) wins += 1;
      else if (theirPoints > yourPoints) losses += 1;
      else ties += 1;
    }
  }

  if (wins + losses + ties === 0) return null;
  return recordLabel(wins, losses, ties);
}

function seasonStatsForManager(shared: SharedLeagueData, managerUserId: string) {
  return shared.lineage
    .map((entry, index) => ({
      index,
      stats: entry.seasonStatsByManager.get(managerUserId) ?? null,
      season: entry.season,
    }))
    .filter((item): item is { index: number; stats: LineageSeasonStats; season: number } => Boolean(item.stats));
}

function weightedSeasonRate(
  shared: SharedLeagueData,
  managerUserId: string,
  selector: (stats: LineageSeasonStats) => number,
) {
  const seasons = seasonStatsForManager(shared, managerUserId);
  if (seasons.length === 0) return null;
  let weightedTotal = 0;
  let weightSum = 0;
  for (const { index, stats } of seasons) {
    const weight = recencyWeight(index);
    weightedTotal += selector(stats) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? Number((weightedTotal / weightSum).toFixed(2)) : null;
}

function priorDealings(shared: SharedLeagueData, viewerUserId: string, managerUserId: string) {
  const tradeSeasons: number[] = [];
  let completedTrades = 0;
  for (const entry of shared.lineage) {
    for (const trade of entry.tradeHistory) {
      if (!trade.managerIds.includes(viewerUserId) || !trade.managerIds.includes(managerUserId)) continue;
      completedTrades += 1;
      tradeSeasons.push(trade.season);
    }
  }
  return {
    completedTrades,
    seasons: [...new Set(tradeSeasons)].sort((a, b) => a - b),
  };
}

function lineageScopeLabel(seasons: number) {
  return `in this league (${pluralize(seasons, 'season')})`;
}

function careerScopeLabel(leagues: number) {
  return `across Sleeper (${pluralize(leagues, 'league')})`;
}

function sourceLabelForRead(status: ManagerFile['status'], chips: ManagerChip[]) {
  if (chips.length > 0) return strongestChipLabel(chips);
  if (status === 'thin') return 'thin file';
  return 'neutral file';
}

function tradeRelationshipReceipt(metrics: PersonaMetrics, relationship: number) {
  if (metrics.priorDealingsCount <= 0) {
    return `data suggests ${relationship}: no completed trades with you in the league lineage.`;
  }
  if (metrics.priorDealingsCount === 1) {
    return `data suggests ${relationship}: traded with you in ${formatSeasonList(metrics.priorDealingsSeasons)}.`;
  }
  return `data suggests ${relationship}: ${metrics.priorDealingsCount} completed trades with you in ${formatSeasonList(metrics.priorDealingsSeasons)}.`;
}

function tradeFriendlinessReceipt(
  metrics: PersonaMetrics,
  friendliness: number,
  lineageScope: string,
) {
  const pieces = [
    metrics.weightedTradesPerSeason == null
      ? `no completed trades/season ${lineageScope}`
      : `${metrics.weightedTradesPerSeason.toFixed(1)} trades/season ${lineageScope}`,
    metrics.tradeInitiationRate == null
      ? 'no completed trade-start sample'
      : `initiates ${metrics.tradeInitiationRate}%`,
    metrics.weightedConsentedTradesPerSeason == null
      ? 'no outside-trade consent sample'
      : `says yes to ${metrics.weightedConsentedTradesPerSeason.toFixed(1)} outside trades/season`,
  ];
  return `data suggests ${friendliness}: ${pieces.join(', ')}.`;
}

async function loadBenchPointsLeft(shared: SharedLeagueData, managerUserId: string) {
  if (!shared.lineupPointsConfirmed) return null;
  const current = shared.lineage[0];
  const roster = current?.rosterByOwner.get(managerUserId);
  if (!current || !roster) return null;
  const maxWeek = Math.max(0, Math.min(shared.currentWeek - 1, current.regularWeeks));
  if (!maxWeek) return null;

  let totalBenchPoints = 0;
  let samples = 0;

  for (let week = 1; week <= maxWeek; week += 1) {
    const matchups = (await sleeperGet<SleeperMatchup[]>(`/league/${shared.leagueId}/matchups/${week}`)) ?? [];
    const matchup = matchups.find((item) => item.roster_id === roster.roster_id);
    if (!matchup?.players_points) continue;
    const starterSet = new Set((matchup.starters ?? []).filter((playerId) => playerId && playerId !== '0'));
    const benchPoints = (matchup.players ?? [])
      .filter((playerId) => !starterSet.has(playerId))
      .reduce((sum, playerId) => sum + Number(matchup.players_points?.[playerId] ?? 0), 0);
    totalBenchPoints += benchPoints;
    samples += 1;
  }

  return average(totalBenchPoints, samples, 1);
}

function fileTag(status: ManagerFile['status']) {
  if (status === 'thin') return 'THIN FILE';
  if (status === 'manual') return 'MANUAL FILE';
  if (status === 'full') return 'THE FILE';
  return null;
}

function tenureLine(tenure: TenureSummary) {
  if (!tenure.seasonsActive || !tenure.firstSeason) return 'First season on Sleeper';
  return `On Sleeper since ${tenure.firstSeason} · ${tenure.seasonsActive} seasons · ${tenure.totalLeagues} leagues`;
}

function strongestChipLabel(chips: ManagerChip[]) {
  return chips[0]?.label.toLowerCase() ?? 'neutral file';
}

function pickBookRead(status: ManagerFile['status'], chips: ManagerChip[], notes: string[]) {
  if (status === 'manual') return 'Manual file. Set the read by hand.';
  if (status === 'unmanaged') return 'No file. Unmanaged team.';
  if (status === 'thin') return notes[0] ?? 'Thin file. Early returns only.';
  const lines: string[] = [];
  const labels = new Set(chips.map((chip) => chip.key));
  if (labels.has('wheeler-dealer')) lines.push('Starts trade talks.');
  else if (labels.has('stand-pat')) lines.push('Sits on the roster.');
  if (labels.has('initiator')) lines.push('Calls first.');
  else if (labels.has('responder')) lines.push('Usually waits.');
  if (labels.has('waiver-shark')) lines.push('Works the wire.');
  if (labels.has('faab-burner')) lines.push('Spends early.');
  if (labels.has('pick-flipper')) lines.push('Moves picks freely.');
  if (labels.has('ring-chaser')) lines.push('Has closed this room before.');
  return lines.slice(0, 3).join(' ') || 'Quiet file. Limited leverage points so far.';
}

function readDefaultsFromMetrics(
  metrics: PersonaMetrics,
  chips: ManagerChip[],
  status: ManagerFile['status'],
) {
  if (status === 'manual' || status === 'unmanaged') {
    return {
      friendliness: PERSONA_RULES.sliderRange.neutral,
      relationship: PERSONA_RULES.sliderRange.neutral,
      sourceLabel: 'neutral file',
      rationale: 'No public Sleeper dossier is available here, so the default read stays neutral.',
      friendlinessReceipt: 'data suggests 5: no public Sleeper trade file is available here.',
      relationshipReceipt: 'data suggests 5: no public Sleeper relationship file is available here.',
    } satisfies ManagerReadDefaults;
  }

  let friendliness = PERSONA_RULES.sliderRange.neutral;
  for (const adjustment of PERSONA_RULES.tradeFriendliness.tradeRateAdjustments) {
    if ((metrics.weightedTradesPerSeason ?? 0) >= adjustment.min) {
      friendliness += adjustment.delta;
      break;
    }
  }
  if ((metrics.weightedTradesPerSeason ?? 0) < PERSONA_RULES.tradeFriendliness.lowTradeRate.lt) {
    friendliness += PERSONA_RULES.tradeFriendliness.lowTradeRate.delta;
  }
  if ((metrics.tradeInitiationRate ?? 0) >= PERSONA_RULES.tradeFriendliness.initiationBonus.min) {
    friendliness += PERSONA_RULES.tradeFriendliness.initiationBonus.delta;
  }
  if (
    (metrics.weightedConsentedTradesPerSeason ?? 0) >=
    PERSONA_RULES.tradeFriendliness.receptivityBonus.minConsentedTradesPerSeason
  ) {
    friendliness += PERSONA_RULES.tradeFriendliness.receptivityBonus.delta;
  }

  let relationship = PERSONA_RULES.sliderRange.neutral;
  for (const adjustment of PERSONA_RULES.relationship.priorDealings) {
    if (metrics.priorDealingsCount >= adjustment.minTrades) {
      relationship += adjustment.delta;
      break;
    }
  }

  const clampedFriendliness = clampRead(friendliness);
  const clampedRelationship = clampRead(relationship);
  const lineageScope = lineageScopeLabel(metrics.lineageSeasons);

  return {
    friendliness: clampedFriendliness,
    relationship: clampedRelationship,
    sourceLabel: sourceLabelForRead(status, chips),
    rationale: 'Trade-friendliness comes from weighted lineage trade volume, who starts the talks, and how often they accept outside offers. Relationship only moves when you have completed trades together in this league lineage.',
    friendlinessReceipt: tradeFriendlinessReceipt(metrics, clampedFriendliness, lineageScope),
    relationshipReceipt: tradeRelationshipReceipt(metrics, clampedRelationship),
  } satisfies ManagerReadDefaults;
}

function chipsFromStats(
  shared: SharedLeagueData,
  aggregate: LineageAggregate | null,
  metrics: PersonaMetrics,
  numbers: ManagerFileNumbers,
) {
  const chips: ManagerChip[] = [];
  const chipRules = PERSONA_RULES.chips;
  const lineageScope = lineageScopeLabel(metrics.lineageSeasons);
  if (aggregate && metrics.weightedTradesPerSeason != null) {
    if (metrics.weightedTradesPerSeason >= chipRules.wheelerDealer.minTradesPerSeason) {
      chips.push({
        key: 'wheeler-dealer',
        label: chipRules.wheelerDealer.label,
        receipt: `${metrics.weightedTradesPerSeason.toFixed(1)} weighted trades/season ${lineageScope} (${aggregate.trades} completed trades total).`,
        threshold: `Threshold: ${chipRules.wheelerDealer.minTradesPerSeason.toFixed(1)}+ trades per season`,
      });
    } else if ((metrics.rawTradesPerSeason ?? 0) < chipRules.standPat.ltTradesPerSeason) {
      chips.push({
        key: 'stand-pat',
        label: chipRules.standPat.label,
        receipt: `${aggregate.trades} completed trade${aggregate.trades === 1 ? '' : 's'} ${lineageScope} (${(metrics.rawTradesPerSeason ?? 0).toFixed(1)} trades/season across the full lineage).`,
        threshold: `Threshold: below ${chipRules.standPat.ltTradesPerSeason.toFixed(1)} trades per season`,
      });
    }
  }

  if (aggregate && metrics.tradeInitiationRate != null && aggregate.trades > 0) {
    if (metrics.tradeInitiationRate >= chipRules.initiator.minInitiationRate) {
      chips.push({
        key: 'initiator',
        label: chipRules.initiator.label,
        receipt: `Started ${aggregate.initiatedTrades} of ${aggregate.trades} completed lineage trades.`,
        threshold: `Threshold: ${chipRules.initiator.minInitiationRate}%+ initiation rate`,
      });
    } else if (metrics.tradeInitiationRate <= chipRules.responder.maxInitiationRate) {
      chips.push({
        key: 'responder',
        label: chipRules.responder.label,
        receipt: `Started ${aggregate.initiatedTrades} of ${aggregate.trades} completed lineage trades.`,
        threshold: `Threshold: ${chipRules.responder.maxInitiationRate}% or below initiation rate`,
      });
    }
  }

  if (aggregate && numbers.waiverAddsPerWeek != null) {
    if (numbers.waiverAddsPerWeek >= shared.waiverQuartiles.high && aggregate.waiverAdds > 0) {
      chips.push({
        key: 'waiver-shark',
        label: chipRules.waiverShark.label,
        receipt: `${aggregate.waiverAdds} adds across ${aggregate.regularWeeks} regular-season weeks ${lineageScope}.`,
        threshold: `Threshold: top quartile at ${shared.waiverQuartiles.high.toFixed(2)} adds/week`,
      });
    } else if (numbers.waiverAddsPerWeek <= shared.waiverQuartiles.low) {
      chips.push({
        key: 'set-and-forget',
        label: chipRules.setAndForget.label,
        receipt: `${aggregate.waiverAdds} adds across ${aggregate.regularWeeks} regular-season weeks ${lineageScope}.`,
        threshold: `Threshold: bottom quartile at ${shared.waiverQuartiles.low.toFixed(2)} adds/week`,
      });
    }
  }

  if (aggregate && numbers.faabUsed != null) {
    const budget = Number(shared.currentLeague.settings?.waiver_budget ?? 100);
    const earlyShare = budget > 0 ? aggregate.earlyFaabSpent / budget : 0;
    if (earlyShare >= chipRules.faabBurner.minEarlyBudgetShare) {
      chips.push({
        key: 'faab-burner',
        label: chipRules.faabBurner.label,
        receipt: `$${aggregate.earlyFaabSpent} spent by week 4 ${lineageScope}.`,
        threshold: `Threshold: ${(chipRules.faabBurner.minEarlyBudgetShare * 100).toFixed(0)}%+ of budget by week 4`,
      });
    } else if (aggregate.earlyFaabSpent === chipRules.faabMiser.maxEarlySpend) {
      chips.push({
        key: 'faab-miser',
        label: chipRules.faabMiser.label,
        receipt: `$${aggregate.earlyFaabSpent} spent by week 4 ${lineageScope}.`,
        threshold: `Threshold: $${chipRules.faabMiser.maxEarlySpend} by week 4`,
      });
    }
  }

  if (leagueType(shared.currentLeague) === 'dynasty' && aggregate) {
    if (aggregate.picksTraded >= Math.max(chipRules.pickFlipper.minAbsolute, aggregate.seasons * chipRules.pickFlipper.minPerSeason)) {
      chips.push({
        key: 'pick-flipper',
        label: chipRules.pickFlipper.label,
        receipt: `${aggregate.picksTraded} draft picks moved in lineage trades ${lineageScope}.`,
        threshold: `Threshold: ${chipRules.pickFlipper.minAbsolute}+ picks moved in the file`,
      });
    } else if (aggregate.picksTraded === chipRules.pickHoarder.exact) {
      chips.push({
        key: 'pick-hoarder',
        label: chipRules.pickHoarder.label,
        receipt: `No draft picks moved in the lineage trade log ${lineageScope}.`,
        threshold: 'Threshold: zero picks moved',
      });
    }
  }

  if ((numbers.titles ?? 0) >= chipRules.ringChaser.minTitles) {
      chips.push({
        key: 'ring-chaser',
        label: chipRules.ringChaser.label,
        receipt: `${numbers.titles} title${numbers.titles === 1 ? '' : 's'} across Sleeper.`,
        threshold: `Threshold: at least ${chipRules.ringChaser.minTitles} title`,
      });
  }

  return chips.slice(0, 3);
}

function manualFile(managerTeam: ApiTeam): ManagerFile {
  const file: ManagerFile = {
    version: CACHE_VERSION,
    provider: 'espn',
    managerKey: managerTeam.ownerId ?? `manual:${managerTeam.rosterId}`,
    managerName: managerTeam.ownerName,
    teamName: managerTeam.teamName,
    rosterId: managerTeam.rosterId,
    avatarUrl: managerTeam.avatarUrl,
    record: recordLabel(
      managerTeam.record.wins,
      managerTeam.record.losses,
      managerTeam.record.ties,
    ),
    fileTag: 'MANUAL FILE',
    status: 'manual',
    tenureLine: 'Manual file. No Sleeper history is available.',
    chips: [],
    numbers: {
      tradesPerSeason: null,
      tradeInitiationRate: null,
      waiverAddsPerWeek: null,
      faabUsed: null,
      careerRecord: null,
      playoffRate: null,
      titles: null,
      headToHeadRecord: null,
      benchPointsLeftPerWeek: null,
    },
    scopes: {
      lineage: 'manual file',
      career: 'manual file',
      headToHead: 'manual file',
      bench: 'manual file',
    },
    bookRead: 'Manual file. Set the read by hand.',
    notes: ['ESPN and manual leagues do not auto-populate public manager history.'],
    compiledAt: Date.now(),
    readDefaults: {
      friendliness: 5,
      relationship: 5,
      sourceLabel: 'manual file',
      rationale: 'No public Sleeper data is connected, so the defaults stay neutral until you edit them.',
      friendlinessReceipt: 'data suggests 5: no public Sleeper trade file is available here.',
      relationshipReceipt: 'data suggests 5: no public Sleeper relationship file is available here.',
    },
  };
  return file;
}

function unmanagedFile(managerTeam: ApiTeam, leagueId: string): ManagerFile {
  const file: ManagerFile = {
    version: CACHE_VERSION,
    provider: 'sleeper',
    managerKey: `vacant:${leagueId}:${managerTeam.rosterId}`,
    managerName: 'Unmanaged team',
    teamName: managerTeam.teamName,
    rosterId: managerTeam.rosterId,
    avatarUrl: managerTeam.avatarUrl,
    record: recordLabel(
      managerTeam.record.wins,
      managerTeam.record.losses,
      managerTeam.record.ties,
    ),
    fileTag: null,
    status: 'unmanaged',
    tenureLine: 'No file. Unmanaged team.',
    chips: [],
    numbers: {
      tradesPerSeason: null,
      tradeInitiationRate: null,
      waiverAddsPerWeek: null,
      faabUsed: null,
      careerRecord: null,
      playoffRate: null,
      titles: null,
      headToHeadRecord: null,
      benchPointsLeftPerWeek: null,
    },
    scopes: {
      lineage: 'no manager attached',
      career: 'no manager attached',
      headToHead: 'no manager attached',
      bench: 'no manager attached',
    },
    bookRead: 'No file. Unmanaged team.',
    notes: ['This roster has no Sleeper manager attached.'],
    compiledAt: Date.now(),
    readDefaults: {
      friendliness: 5,
      relationship: 5,
      sourceLabel: 'neutral file',
      rationale: 'There is no manager history to scout here.',
      friendlinessReceipt: 'data suggests 5: no manager is attached to this roster.',
      relationshipReceipt: 'data suggests 5: no manager is attached to this roster.',
    },
  };
  return file;
}

async function buildSleeperFile(args: CompileManagerFileArgs) {
  const managerKey = String(args.managerTeam.ownerId ?? '');
  const shared = await loadSharedLeagueData(args.leagueId, args.currentWeek);
  const aggregate = shared.aggregates.get(managerKey) ?? null;
  const career = await loadCareer(managerKey);
  const dealings = priorDealings(shared, args.viewerUserId, managerKey);
  const lineageSeasons = aggregate?.seasons ?? 0;
  const metrics: PersonaMetrics = {
    lineageSeasons,
    weightedTradesPerSeason: weightedSeasonRate(shared, managerKey, (stats) => stats.trades),
    rawTradesPerSeason:
      aggregate && aggregate.seasons > 0 ? round(aggregate.trades / aggregate.seasons, 2) : null,
    weightedConsentedTradesPerSeason: weightedSeasonRate(shared, managerKey, (stats) => stats.consentedTrades),
    tradeInitiationRate:
      aggregate && aggregate.trades > 0 ? percent(aggregate.initiatedTrades / aggregate.trades) : null,
    waiverAddsPerWeek:
      aggregate && aggregate.regularWeeks > 0
        ? round(aggregate.waiverAdds / aggregate.regularWeeks, 2)
        : null,
    priorDealingsCount: dealings.completedTrades,
    priorDealingsSeasons: dealings.seasons,
  };
  const scopes: ManagerFileScopes = {
    lineage: lineageScopeLabel(lineageSeasons),
    career: careerScopeLabel(career.inspectedLeagues),
    headToHead: 'league lineage',
    bench: 'current season',
  };
  const numbers: ManagerFileNumbers = {
    tradesPerSeason: metrics.weightedTradesPerSeason != null ? round(metrics.weightedTradesPerSeason, 1) : null,
    tradeInitiationRate: metrics.tradeInitiationRate,
    waiverAddsPerWeek: metrics.waiverAddsPerWeek,
    faabUsed: aggregate ? aggregate.faabSpent : null,
    careerRecord: career.careerRecord,
    playoffRate: career.playoffRate != null ? percent(career.playoffRate) : null,
    titles: career.titles,
    headToHeadRecord: await loadHeadToHead(shared, args.viewerUserId, managerKey),
    benchPointsLeftPerWeek: await loadBenchPointsLeft(shared, managerKey),
  };

  const notes: string[] = [];
  if (career.seasonsActive <= 1) notes.push('First season on Sleeper. No deep file yet.');
  if ((aggregate?.trades ?? 0) === 0 && (aggregate?.waiverAdds ?? 0) === 0) {
    notes.push('No trade or waiver history in this league file yet.');
  }
  if (aggregate) {
    notes.push(
      `Lineage log: ${aggregate.trades} completed trades, ${aggregate.waiverAdds} adds, and $${aggregate.faabSpent} FAAB ${scopes.lineage}.`,
    );
  }
  if (numbers.headToHeadRecord == null) notes.push('No head-to-head history vs you in the lineage.');
  if (numbers.benchPointsLeftPerWeek == null && shared.lineupPointsConfirmed) {
    notes.push('No finished weeks yet for bench-points-left.');
  }
  if (!shared.lineupPointsConfirmed) notes.push('Bench-points-left is blocked by missing players_points data.');

  const status: ManagerFile['status'] =
    career.seasonsActive <= 1 || ((aggregate?.trades ?? 0) === 0 && (aggregate?.waiverAdds ?? 0) === 0)
      ? 'thin'
      : 'full';
  const chips = chipsFromStats(shared, aggregate, metrics, numbers);
  const file: ManagerFile = {
    version: CACHE_VERSION,
    provider: 'sleeper',
    managerKey,
    managerName: args.managerTeam.ownerName,
    teamName: args.managerTeam.teamName,
    rosterId: args.managerTeam.rosterId,
    avatarUrl: args.managerTeam.avatarUrl,
    record: recordLabel(
      args.managerTeam.record.wins,
      args.managerTeam.record.losses,
      args.managerTeam.record.ties,
    ),
    fileTag: fileTag(status),
    status,
    tenureLine: tenureLine(career),
    chips,
    numbers,
    scopes,
    bookRead: pickBookRead(status, chips, notes),
    notes,
    compiledAt: Date.now(),
    readDefaults: readDefaultsFromMetrics(metrics, chips, status),
  };

  return file;
}

export function formatCompiledAt(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function invalidatePersonaCaches(leagueId: string, managerKey: string) {
  fileCache.clear();
  sharedLeagueCache.clear();
  tenureCache.clear();
  careerCache.clear();
  jsonCache.clear();
  try {
    window.localStorage.removeItem(storageKey(leagueId, managerKey));
    window.localStorage.removeItem(sharedStorageKey(leagueId));
  } catch {
    // ignore
  }
}

export async function compileManagerFile(args: CompileManagerFileArgs) {
  const managerKey = args.provider === 'espn'
    ? args.managerTeam.ownerId ?? `manual:${args.managerTeam.rosterId}`
    : args.managerTeam.ownerId ?? `vacant:${args.leagueId}:${args.managerTeam.rosterId}`;
  const cacheKey = `${args.provider}:${args.leagueId}:${managerKey}:${args.currentWeek}`;
  if (args.force) {
    invalidatePersonaCaches(args.leagueId, managerKey);
  }
  if (!args.force) {
    const cached = readCachedFile(args.leagueId, managerKey);
    if (cached) return cached;
    if (fileCache.has(cacheKey)) return fileCache.get(cacheKey)!;
  }

  const job = (async () => {
    if (args.provider === 'espn') {
      const manual = manualFile(args.managerTeam);
      saveCachedFile(args.leagueId, manual);
      return manual;
    }
    if (!args.managerTeam.ownerId) {
      const empty = unmanagedFile(args.managerTeam, args.leagueId);
      saveCachedFile(args.leagueId, empty);
      return empty;
    }
    const file = await buildSleeperFile(args);
    saveCachedFile(args.leagueId, file);
    return file;
  })();

  fileCache.set(cacheKey, job);
  return job;
}
