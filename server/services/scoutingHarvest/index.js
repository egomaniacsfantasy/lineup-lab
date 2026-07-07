import { createEspnProvider } from '../../providers/espnProvider.js';
import { sleeperProvider } from '../../providers/sleeperProvider.js';
import { computeScoutingReads } from '../scoutingSignals.js';
import { replaceScoutingReads, upsertScoutingEvents } from '../scoutingStore.js';
import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { harvestEspnScouting } from './espn.js';
import { harvestSleeperScouting } from './sleeper.js';

async function currentContext(provider, leagueId) {
  const [league, rosters, users] = await Promise.all([
    provider.getLeague(leagueId),
    provider.getRosters(leagueId),
    provider.getUsers(leagueId),
  ]);
  const usersByOwner = new Map(users.map((u) => [u.ownerId, u]));
  const teams = rosters.map((r) => ({
    ...r,
    ownerName: usersByOwner.get(r.ownerId)?.ownerName ?? 'Manager',
    teamName: usersByOwner.get(r.ownerId)?.teamName ?? `Roster ${r.rosterId}`,
  }));
  const ids = [...new Set(teams.flatMap((t) => t.players ?? []))];
  const players = await provider.getPlayerCatalog(ids);
  return { league, teams, players };
}

export async function runScoutingHarvest({
  provider = 'sleeper',
  leagueId,
  season,
  espnS2,
  swid,
}) {
  if (!getSupabaseAdmin()) {
    const error = new Error('scouting_store_unconfigured');
    error.status = 503;
    throw error;
  }

  const harvested =
    provider === 'espn'
      ? await harvestEspnScouting({ leagueId, season, espnS2, swid })
      : await harvestSleeperScouting({ leagueId });

  await upsertScoutingEvents(harvested.events);

  const contextProvider =
    provider === 'espn'
      ? createEspnProvider({ season: String(season ?? harvested.season), espnS2, swid })
      : sleeperProvider;
  const context = await currentContext(contextProvider, leagueId).catch(() => null);

  const reads = computeScoutingReads({
    events: harvested.events,
    leagueId: String(leagueId),
    provider,
    managers: harvested.managers,
    currentContext: context,
  });

  await replaceScoutingReads({
    provider,
    leagueId: String(leagueId),
    reads: reads.map(({ live_needs: _liveNeeds, ...read }) => read),
  });

  return {
    provider,
    leagueId: String(leagueId),
    eventCount: harvested.events.length,
    readCount: reads.length,
    managers: harvested.managers,
    reads,
    report: harvested.report,
  };
}
