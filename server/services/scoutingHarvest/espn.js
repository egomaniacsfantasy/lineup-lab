import crypto from 'node:crypto';
import { getEspnCreds } from '../../providers/espnCredStore.js';

const ESPN_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

function hash(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

function normalizeEvent(event) {
  return {
    id: hash({
      league_id: event.league_id,
      season: event.season,
      manager_key: event.manager_key,
      event_type: event.event_type,
      player_id: event.player_id ?? null,
      detail: event.detail,
    }),
    harvested_at: new Date().toISOString(),
    ...event,
  };
}

function headersFor(leagueId, espnS2, swid) {
  const stored = getEspnCreds(leagueId);
  const s2 = espnS2 || stored?.espnS2;
  const sw = swid || stored?.swid;
  if (!s2 || !sw) return {};
  const cleanSwid = sw.startsWith('{') ? sw : `{${sw}}`;
  return { Cookie: `espn_s2=${s2}; SWID=${cleanSwid}` };
}

async function espnGet({ season, leagueId, espnS2, swid, views }) {
  const url = `${ESPN_BASE}/seasons/${season}/segments/0/leagues/${leagueId}?${views
    .map((view) => `view=${view}`)
    .join('&')}`;
  const response = await fetch(url, { headers: headersFor(leagueId, espnS2, swid) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ESPN scouting ${response.status}`);
  return response.json();
}

function managerForTeam(blob, teamId) {
  const team = (blob.teams ?? []).find((t) => t.id === teamId);
  return team?.owners?.[0] ?? null;
}

function playerDetail(player = {}) {
  return {
    player_name: player.fullName ?? null,
    team: player.proTeamAbbrev ?? null,
    position: player.defaultPositionId ?? null,
  };
}

function harvestDraft(blob, season, leagueId) {
  const events = [];
  const picks = blob.draftDetail?.picks ?? blob.draftDetail?.draftedPlayers ?? [];
  for (const pick of picks) {
    const player = pick.playerPoolEntry?.player ?? pick.player ?? {};
    const managerKey = pick.memberId ?? managerForTeam(blob, pick.teamId);
    if (!managerKey || !player.id) continue;
    events.push(normalizeEvent({
      league_id: String(leagueId),
      season: Number(season),
      manager_key: String(managerKey),
      provider: 'espn',
      event_type: 'draft_pick',
      player_id: `espn-${player.id}`,
      detail: {
        pick_no: pick.overallPickNumber ?? pick.overallPick ?? pick.pickNumber,
        round: pick.roundId ?? pick.round,
        roster_id: pick.teamId ?? null,
        ...playerDetail(player),
      },
      league_format: blob.settings?.draftSettings?.keeperCount ? 'keeper' : 'redraft',
    }));
  }
  return events;
}

function harvestTransactions(blob, season, leagueId) {
  const events = [];
  const txns = blob.transactions ?? blob.transactionCounter?.transactions ?? [];
  for (const txn of txns) {
    const week = txn.scoringPeriodId ?? txn.matchupPeriodId ?? null;
    const items = txn.items ?? [];
    for (const item of items) {
      const managerKey = item.toTeamId ? managerForTeam(blob, item.toTeamId) : managerForTeam(blob, item.fromTeamId);
      const player = item.playerPoolEntry?.player ?? item.player ?? {};
      if (!managerKey || !player.id) continue;
      const eventType = item.type === 'DROP' ? 'waiver_drop' : item.bidAmount ? 'faab_bid' : 'waiver_add';
      events.push(normalizeEvent({
        league_id: String(leagueId),
        season: Number(season),
        manager_key: String(managerKey),
        provider: 'espn',
        event_type: eventType,
        player_id: `espn-${player.id}`,
        detail: {
          transaction_id: txn.id ?? txn.proposalId ?? null,
          week,
          faab_amount: item.bidAmount ?? 0,
          faab_share: item.bidAmount ? item.bidAmount / 100 : 0,
          ...playerDetail(player),
        },
        league_format: blob.settings?.draftSettings?.keeperCount ? 'keeper' : 'redraft',
      }));
    }
  }
  return events;
}

export async function harvestEspnScouting({ leagueId, season, espnS2, swid }) {
  const startSeason = Number(season ?? new Date().getUTCFullYear());
  const events = [];
  const report = { provider: 'espn', leagues: [], crossLeagueCaps: [] };
  let managers = [];

  for (const seasonId of [startSeason, startSeason - 1, startSeason - 2, startSeason - 3]) {
    const blob = await espnGet({
      season: seasonId,
      leagueId,
      espnS2,
      swid,
      views: ['mSettings', 'mTeam', 'mDraftDetail', 'mTransactions'],
    });
    if (!blob) continue;
    managers = (blob.teams ?? []).map((team) => ({
      manager_key: team.owners?.[0] ?? String(team.id),
      name: team.primaryOwner ?? team.owners?.[0] ?? `Team ${team.id}`,
      team_name: `${team.location ?? ''} ${team.nickname ?? ''}`.trim() || team.name || `Team ${team.id}`,
      avatar: null,
    }));
    const seasonEvents = [
      ...harvestDraft(blob, seasonId, leagueId),
      ...harvestTransactions(blob, seasonId, leagueId),
    ];
    events.push(...seasonEvents);
    report.leagues.push({
      league_id: String(leagueId),
      season: seasonId,
      format: blob.settings?.draftSettings?.keeperCount ? 'keeper' : 'redraft',
      transactions: true,
      events: seasonEvents.length,
    });
  }

  return {
    provider: 'espn',
    leagueId: String(leagueId),
    season: startSeason,
    managers,
    events,
    report,
  };
}
