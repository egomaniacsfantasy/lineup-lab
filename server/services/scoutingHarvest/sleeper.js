import crypto from 'node:crypto';
import { recordCall } from '../../cache.js';

const BASE = 'https://api.sleeper.app/v1';
const DELAY_MS = 175;

function sleep(ms = DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha1').update(stableStringify(value)).digest('hex');
}

function eventId(event) {
  return hash({
    league_id: event.league_id,
    season: event.season,
    manager_key: event.manager_key,
    provider: event.provider,
    event_type: event.event_type,
    player_id: event.player_id ?? null,
    natural: event.detail?.transaction_id ?? event.detail?.draft_id ?? event.detail,
  });
}

async function sleeperGet(endpoint, key) {
  recordCall(`scouting:${key}`);
  const response = await fetch(`${BASE}${endpoint}`);
  await sleep();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Sleeper ${endpoint} responded ${response.status}`);
  return response.json();
}

function leagueFormat(rawLeague) {
  if (rawLeague?.settings?.type === 2) return 'dynasty';
  if (rawLeague?.settings?.type === 1) return 'keeper';
  return 'redraft';
}

function normalizeEvent(event) {
  return {
    id: eventId(event),
    harvested_at: new Date().toISOString(),
    ...event,
  };
}

function rosterOwnerMap(rosters = []) {
  return new Map(rosters.map((r) => [r.roster_id, r.owner_id]).filter(([, owner]) => owner));
}

function playerMeta(catalog, playerId) {
  const player = catalog?.[playerId] ?? {};
  return {
    player_name: player.full_name ?? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() ?? null,
    team: player.team ?? null,
    position: player.position ?? player.fantasy_positions?.[0] ?? null,
  };
}

async function loadCatalog() {
  return sleeperGet('/players/nfl', 'players/nfl');
}

async function harvestLeagueOnce(leagueId, { includeTransactions, catalog, report }) {
  const rawLeague = await sleeperGet(`/league/${leagueId}`, 'league');
  if (!rawLeague) return { events: [], league: null, users: [], rosters: [] };

  const format = leagueFormat(rawLeague);
  const season = Number(rawLeague.season);
  const users = await sleeperGet(`/league/${leagueId}/users`, 'league/users');
  const rosters = await sleeperGet(`/league/${leagueId}/rosters`, 'league/rosters');
  const drafts = await sleeperGet(`/league/${leagueId}/drafts`, 'league/drafts');
  const ownerByRoster = rosterOwnerMap(rosters ?? []);
  const events = [];

  for (const roster of rosters ?? []) {
    const managerKey = roster.owner_id;
    if (!managerKey) continue;
    for (const playerId of roster.players ?? []) {
      events.push(normalizeEvent({
        league_id: String(leagueId),
        season,
        manager_key: managerKey,
        provider: 'sleeper',
        event_type: 'waiver_add',
        player_id: String(playerId),
        detail: {
          source: 'roster_snapshot',
          roster_id: roster.roster_id,
          context: `${leagueId}:${season}:roster`,
          ...playerMeta(catalog, playerId),
        },
        league_format: format,
      }));
    }
  }

  for (const draft of drafts ?? []) {
    const picks = await sleeperGet(`/draft/${draft.draft_id}/picks`, 'draft/picks');
    for (const pick of picks ?? []) {
      const managerKey = pick.picked_by ?? ownerByRoster.get(pick.roster_id);
      if (!managerKey || !pick.player_id) continue;
      events.push(normalizeEvent({
        league_id: String(leagueId),
        season,
        manager_key: String(managerKey),
        provider: 'sleeper',
        event_type: 'draft_pick',
        player_id: String(pick.player_id),
        detail: {
          draft_id: draft.draft_id,
          pick_no: pick.pick_no,
          round: pick.round,
          draft_slot: pick.draft_slot,
          roster_id: pick.roster_id,
          is_keeper: Boolean(pick.is_keeper),
          context: `${leagueId}:${season}:draft`,
          ...playerMeta(catalog, pick.player_id),
        },
        league_format: format,
      }));
    }
  }

  if (includeTransactions) {
    for (let week = 1; week <= 18; week += 1) {
      const transactions = await sleeperGet(`/league/${leagueId}/transactions/${week}`, 'league/transactions');
      for (const txn of transactions ?? []) {
        if (txn.status && txn.status !== 'complete') continue;
        const createdAt = txn.created ? new Date(txn.created).toISOString() : null;
        const managers = new Set((txn.roster_ids ?? []).map((id) => ownerByRoster.get(id)).filter(Boolean));

        if (txn.type === 'trade') {
          for (const managerKey of managers) {
            events.push(normalizeEvent({
              league_id: String(leagueId),
              season,
              manager_key: String(managerKey),
              provider: 'sleeper',
              event_type: 'trade',
              player_id: null,
              detail: {
                transaction_id: txn.transaction_id,
                week,
                created_at: createdAt,
                roster_ids: txn.roster_ids ?? [],
                adds: txn.adds ?? {},
                drops: txn.drops ?? {},
                draft_picks: txn.draft_picks ?? [],
              },
              league_format: format,
            }));
          }
        }

        for (const [playerId, rosterId] of Object.entries(txn.adds ?? {})) {
          const managerKey = ownerByRoster.get(rosterId);
          if (!managerKey) continue;
          const faab = Number(txn.settings?.waiver_bid ?? txn.waiver_budget?.find((b) => b.receiver === rosterId)?.amount ?? 0);
          events.push(normalizeEvent({
            league_id: String(leagueId),
            season,
            manager_key: String(managerKey),
            provider: 'sleeper',
            event_type: txn.type === 'waiver' ? 'faab_bid' : 'waiver_add',
            player_id: String(playerId),
            detail: {
              transaction_id: txn.transaction_id,
              week,
              created_at: createdAt,
              roster_id: rosterId,
              faab_amount: faab,
              faab_share: faab ? faab / 100 : 0,
              ...playerMeta(catalog, playerId),
            },
            league_format: format,
          }));
        }

        for (const [playerId, rosterId] of Object.entries(txn.drops ?? {})) {
          const managerKey = ownerByRoster.get(rosterId);
          if (!managerKey) continue;
          events.push(normalizeEvent({
            league_id: String(leagueId),
            season,
            manager_key: String(managerKey),
            provider: 'sleeper',
            event_type: 'waiver_drop',
            player_id: String(playerId),
            detail: {
              transaction_id: txn.transaction_id,
              week,
              created_at: createdAt,
              roster_id: rosterId,
              ...playerMeta(catalog, playerId),
            },
            league_format: format,
          }));
        }
      }
    }
  }

  report.leagues.push({
    league_id: String(leagueId),
    season,
    format,
    transactions: Boolean(includeTransactions),
    events: events.length,
  });

  return { events, league: rawLeague, users: users ?? [], rosters: rosters ?? [] };
}

async function previousLeagueIds(startLeague) {
  const ids = [];
  let next = startLeague?.previous_league_id ?? null;
  for (let i = 0; i < 3 && next; i += 1) {
    ids.push(String(next));
    const previous = await sleeperGet(`/league/${next}`, 'league');
    next = previous?.previous_league_id ?? null;
  }
  return ids;
}

export async function harvestSleeperScouting({ leagueId }) {
  const report = { provider: 'sleeper', leagues: [], crossLeagueCaps: [] };
  const catalog = await loadCatalog();
  const current = await harvestLeagueOnce(leagueId, { includeTransactions: true, catalog, report });
  if (!current.league) throw new Error('league_not_found');

  const events = [...current.events];
  const priorIds = await previousLeagueIds(current.league);
  for (const priorLeagueId of priorIds) {
    const prior = await harvestLeagueOnce(priorLeagueId, { includeTransactions: true, catalog, report });
    events.push(...prior.events);
  }

  const currentSeason = Number(current.league.season);
  const managerIds = (current.users ?? []).map((u) => u.user_id).filter(Boolean);
  for (const managerKey of managerIds) {
    for (const season of [currentSeason, currentSeason - 1]) {
      const leagues = await sleeperGet(`/user/${managerKey}/leagues/nfl/${season}`, 'user/leagues');
      const sorted = [...(leagues ?? [])].sort((a, b) => Number(b.last_transaction_id ?? b.last_read_id ?? 0) - Number(a.last_transaction_id ?? a.last_read_id ?? 0));
      const capped = sorted.slice(0, 8);
      if (sorted.length > capped.length) {
        report.crossLeagueCaps.push({ manager_key: managerKey, season, seen: sorted.length, harvested: capped.length });
      }
      for (const league of capped) {
        if (String(league.league_id) === String(leagueId) || priorIds.includes(String(league.league_id))) continue;
        const harvested = await harvestLeagueOnce(league.league_id, { includeTransactions: false, catalog, report });
        events.push(...harvested.events);
      }
    }
  }

  const managers = (current.users ?? []).map((u) => ({
    manager_key: u.user_id,
    name: u.display_name,
    team_name: u.metadata?.team_name || `${u.display_name}'s Team`,
    avatar: u.avatar ?? null,
  }));

  return {
    provider: 'sleeper',
    leagueId: String(leagueId),
    season: Number(current.league.season),
    managers,
    events,
    report,
  };
}
