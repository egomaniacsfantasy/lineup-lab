/**
 * SleeperProvider — the only file that knows Sleeper exists.
 * Implements the LeagueProvider contract (see leagueProvider.js).
 *
 * Cache policy follows the endpoint map in the sync spec:
 *   user resolve        — on connect (10 min)
 *   user leagues        — daily
 *   league settings     — daily (refreshed on app open via bootstrap)
 *   rosters             — 5 min (covers lineup-lock-day polling)
 *   league users        — daily
 *   matchups            — 90s in game windows, hourly outside
 *   transactions        — hourly
 *   player catalog      — daily, persisted to disk, served trimmed
 *   season state        — hourly
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cached, recordCall } from '../cache.js';
import { matchupTtlMs } from '../gameWindows.js';

const BASE = 'https://api.sleeper.app/v1';
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const CATALOG_FILE = path.join(DATA_DIR, 'players-nfl.json');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function sleeperGet(endpoint, endpointKey) {
  recordCall(endpointKey);
  const response = await fetch(`${BASE}${endpoint}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Sleeper ${endpoint} responded ${response.status}`);
  }

  return response.json();
}

function scoringFamily(scoringSettings) {
  const rec = scoringSettings?.rec ?? 0;
  if (rec >= 0.75) return 'ppr';
  if (rec >= 0.25) return 'half-ppr';
  return 'standard';
}

/** Settings beyond the plain PPR/half/standard families that change pricing. */
function hasCustomScoring(scoringSettings) {
  if (!scoringSettings) return false;
  const s = scoringSettings;
  const passTd = s.pass_td ?? 4;
  const bonusTe = s.bonus_rec_te ?? 0;
  const recVariants = [s.rec ?? 0];
  const plainRec = recVariants.every((v) => v === 0 || v === 0.5 || v === 1);
  return passTd !== 4 || bonusTe !== 0 || !plainRec;
}

function mapLeagueSummary(raw) {
  return {
    id: raw.league_id,
    providerId: 'sleeper',
    name: raw.name,
    season: raw.season,
    totalTeams: raw.total_rosters,
    scoringFamily: scoringFamily(raw.scoring_settings),
    hasCustomScoring: hasCustomScoring(raw.scoring_settings),
    status: raw.status, // pre_draft | drafting | in_season | complete
    avatar: raw.avatar ?? null,
  };
}

/* Exported for test/sleeperInjuryFields.test.mjs: a field silently dropped
   here does not exist anywhere downstream. */
export function trimCatalogEntry(id, p) {
  return {
    id,
    name: p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() ?? id,
    firstName: p.first_name ?? '',
    lastName: p.last_name ?? '',
    team: p.team ?? null,
    position: p.position ?? (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : null),
    fantasyPositions: p.fantasy_positions ?? [],
    byeWeek: null,
    status: p.status ?? null,
    injuryStatus: p.injury_status ?? null,
    /* The rest of Sleeper's injury block. Coverage measured against the live
       catalogue on 2026-08-23 (4,263 skill-position players, preseason):

         injury_status           6.0%   Questionable / IR / NA / PUP / DNR / Out
         injury_body_part        5.3%   Knee, Hamstring, "Knee - ACL", Achilles
         injury_notes            0.8%   free text, e.g. "Surgery"
         injury_start_date       0.0%
         practice_participation  0.0%
         practice_description    0.0%
         news_updated           74.7%   ms timestamp of last news

       Three of those are empty in every row today. Two of them —
       practice_participation and practice_description — are fed by the
       Wednesday/Thursday/Friday practice reports, which teams do not file
       until the regular season, so preseason emptiness is expected rather than
       evidence they never populate. They are carried anyway: an always-null
       key costs a key, and the alternative is discovering in week 2 that we
       threw away the one signal that says whether a player practised.

       injury_start_date has no such excuse and may simply be unused. Carried
       for the same reason and worth nothing until it is not zero.

       Nothing downstream should present practice fields as data until they are
       observed non-null in season. Empty is not the same as healthy, and a UI
       that renders a blank practice report as "full participation" would be
       inventing a fact. */
    injuryBodyPart: p.injury_body_part ?? null,
    injuryNotes: p.injury_notes ?? null,
    injuryStartDate: p.injury_start_date ?? null,
    practiceParticipation: p.practice_participation ?? null,
    practiceDescription: p.practice_description ?? null,
    newsUpdated: p.news_updated ?? null,
    number: p.number ?? null,
  };
}

/* Any key trimCatalogEntry always writes. A snapshot from before that key
   existed is the same age as one written a minute ago, so freshness alone will
   happily serve the old shape for a full day after a deploy that added a
   field — and the field reads as `undefined` rather than null the whole time,
   which is exactly the distinction downstream code is asked to respect. Cheaper
   to notice the shape than to reason about who is holding a stale one. */
const CATALOG_SHAPE_KEY = 'practiceParticipation';

export function snapshotMatchesCurrentShape(catalog) {
  const first = Object.values(catalog ?? {})[0];
  return first != null && CATALOG_SHAPE_KEY in first;
}

async function loadFullCatalog() {
  return cached('sleeper:catalog', DAY, async () => {
    // serve from disk if today's snapshot exists and was written by this code
    try {
      const stat = fs.statSync(CATALOG_FILE);
      if (Date.now() - stat.mtimeMs < DAY) {
        const snapshot = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
        if (snapshotMatchesCurrentShape(snapshot)) return snapshot;
        console.log('[sleeper] catalog snapshot predates the current shape, refetching');
      }
    } catch {
      // no snapshot yet
    }

    const raw = await sleeperGet('/players/nfl', 'players/nfl');
    const trimmed = {};
    for (const [id, p] of Object.entries(raw)) {
      // keep skill positions + team defenses; drop the long tail
      const pos = p.position ?? p.fantasy_positions?.[0];
      if (!['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].includes(pos)) continue;
      trimmed[id] = trimCatalogEntry(id, p);
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(trimmed));
    return trimmed;
  });
}

export const sleeperProvider = {
  providerId: 'sleeper',

  async getUser(username) {
    const raw = await cached(`sleeper:user:${username.toLowerCase()}`, 10 * MINUTE, () =>
      sleeperGet(`/user/${encodeURIComponent(username)}`, 'user'),
    );
    if (!raw) return null;
    return {
      id: raw.user_id,
      username: raw.username ?? username,
      displayName: raw.display_name ?? username,
      avatarUrl: raw.avatar ? `https://sleepercdn.com/avatars/thumbs/${raw.avatar}` : null,
    };
  },

  async getLeagues(userId, season) {
    // Which leagues you belong to changes the moment you join or leave one, so
    // this must stay fresh — a day-long cache means a league you just joined
    // won't appear for up to 24h. Keep a short cache only to dedupe rapid
    // reconnects.
    const raw = await cached(`sleeper:leagues:${userId}:${season}`, 2 * MINUTE, () =>
      sleeperGet(`/user/${userId}/leagues/nfl/${season}`, 'user/leagues'),
    );
    return (raw ?? []).map(mapLeagueSummary);
  },

  async getLeague(leagueId) {
    const raw = await cached(`sleeper:league:${leagueId}`, DAY, () =>
      sleeperGet(`/league/${leagueId}`, 'league'),
    );
    if (!raw) return null;
    // Sleeper settings.type: 0 redraft, 1 keeper, 2 dynasty.
    const leagueType =
      raw.settings?.type === 2 ? 'dynasty' : raw.settings?.type === 1 ? 'keeper' : 'redraft';
    return {
      ...mapLeagueSummary(raw),
      scoringSettings: raw.scoring_settings ?? {},
      rosterPositions: raw.roster_positions ?? [],
      playoffWeekStart: raw.settings?.playoff_week_start ?? null,
      playoffTeams: raw.settings?.playoff_teams ?? null,
      lastScoredWeek: raw.settings?.last_scored_leg ?? null,
      regularSeasonWeeks:
        (raw.settings?.playoff_week_start ?? 15) - 1 || 14,
      leagueType,
      bestBall: raw.settings?.best_ball === 1,
      divisions: raw.settings?.divisions ?? null,
      // Sleeper doesn't expose a clean reseed flag (playoff_type values aren't
      // verified) — null (fixed) so we never silently reseed; user-overridable.
      playoffReseed: null,
      // Not detected — defaults to ON when divisions exist (engine); overridable.
      divisionWinnerPriority: null,
    };
  },

  async getRosters(leagueId) {
    const raw = await cached(`sleeper:rosters:${leagueId}`, 5 * MINUTE, () =>
      sleeperGet(`/league/${leagueId}/rosters`, 'league/rosters'),
    );
    return (raw ?? []).map((r) => ({
      rosterId: r.roster_id,
      teamId: `${leagueId}:${r.roster_id}`,
      ownerId: r.owner_id ?? null,
      coOwners: r.co_owners ?? [],
      players: r.players ?? [],
      starters: (r.starters ?? []).filter((p) => p && p !== '0'),
      reserve: r.reserve ?? [],
      record: {
        wins: r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
        ties: r.settings?.ties ?? 0,
      },
      pointsFor: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
      pointsAgainst:
        (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100,
      division: r.settings?.division ?? null,
    }));
  },

  async getUsers(leagueId) {
    const raw = await cached(`sleeper:users:${leagueId}`, DAY, () =>
      sleeperGet(`/league/${leagueId}/users`, 'league/users'),
    );
    return (raw ?? []).map((u) => ({
      ownerId: u.user_id,
      ownerName: u.display_name,
      /* Sleeper only has a team name when the manager set one. Manufacturing
         "fantasygodcasta's Team" out of a username invents a longer string
         than the platform itself shows, and it was the reason two rows in the
         picker needed three lines and still ended in an ellipsis. The handle
         is how Sleeper refers to them, so it is how we refer to them. */
      teamName: u.metadata?.team_name || u.display_name,
      avatarUrl: u.avatar ? `/api/img/avatar/${u.avatar}` : null,
    }));
  },

  async getMatchups(leagueId, week) {
    const raw = await cached(`sleeper:matchups:${leagueId}:${week}`, matchupTtlMs(), () =>
      sleeperGet(`/league/${leagueId}/matchups/${week}`, 'league/matchups'),
    );
    return (raw ?? []).map((m) => ({
      matchupId: m.matchup_id,
      week,
      rosterId: m.roster_id,
      points: m.points ?? 0,
      playersPoints: m.players_points ?? {},
      starters: (m.starters ?? []).filter((p) => p && p !== '0'),
      players: m.players ?? [],
    }));
  },

  async getTransactions(leagueId, week) {
    const raw = await cached(`sleeper:txns:${leagueId}:${week}`, HOUR, () =>
      sleeperGet(`/league/${leagueId}/transactions/${week}`, 'league/transactions'),
    );
    return raw ?? [];
  },

  async getPlayerCatalog(ids) {
    const catalog = await loadFullCatalog();
    if (!ids) return catalog;
    const subset = {};
    for (const id of ids) {
      if (catalog[id]) subset[id] = catalog[id];
    }
    return subset;
  },

  async getDrafts(leagueId) {
    const raw = await cached(`sleeper:drafts:${leagueId}`, DAY, () =>
      sleeperGet(`/league/${leagueId}/drafts`, 'league/drafts'),
    );
    return (raw ?? []).map((d) => ({
      draftId: d.draft_id,
      status: d.status, // pre_draft | drafting | complete
      type: d.type,
      rounds: d.settings?.rounds ?? null,
      startTime: d.start_time ?? null,
    }));
  },

  async getDraftPicks(draftId) {
    const raw = await cached(`sleeper:draftpicks:${draftId}`, DAY, () =>
      sleeperGet(`/draft/${draftId}/picks`, 'draft/picks'),
    );
    return (raw ?? []).map((p) => ({
      pickNo: p.pick_no,
      round: p.round,
      draftSlot: p.draft_slot,
      rosterId: p.roster_id,
      pickedBy: p.picked_by,
      playerId: p.player_id,
      isKeeper: Boolean(p.is_keeper),
    }));
  },

  async getSeasonState() {
    const raw = await cached('sleeper:state', HOUR, () =>
      sleeperGet('/state/nfl', 'state'),
    );
    return {
      season: raw.season,
      week: raw.week,
      displayWeek: raw.display_week,
      seasonType: raw.season_type,
      previousSeason: raw.previous_season,
    };
  },
};
