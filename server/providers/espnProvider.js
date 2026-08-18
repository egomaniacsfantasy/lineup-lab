/**
 * ESPN Fantasy Football provider.
 *
 * ESPN has no public/OAuth API, so we read the same unofficial v3 endpoints
 * the ESPN web app uses (lm-api-reads.fantasy.espn.com). Public leagues need
 * no auth; private leagues need the user's own espn_s2 + SWID cookies, which
 * the client passes through per request — read-only, the user's own data.
 *
 * The whole league comes back in ONE call (with views), so every provider
 * method derives its slice from that single cached blob.
 *
 * Player identity: ESPN uses its own player ids, but Odds Gods prices against
 * Franco's projections, which are keyed to SLEEPER ids. So we crosswalk every
 * ESPN player into the Sleeper catalog by normalized name + position. That
 * keeps projections, headshots, and the engine working unchanged; anyone who
 * doesn't resolve simply shows no projection (flagged), never a wrong one.
 */
import { cached } from '../cache.js';
import { sleeperProvider } from './sleeperProvider.js';
import { normalizeName } from '../projections/importer.js';
import { getEspnCreds } from './espnCredStore.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ESPN_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

// ESPN proTeamId → NFL abbreviation (Sleeper's team codes).
const PRO_TEAM = {
  0: null, 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN',
  8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR',
  15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI',
  22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS',
  29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

// ESPN defaultPositionId → fantasy position.
const POSITION = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };

// ESPN lineupSlotId → roster slot label the engine understands.
const SLOT_LABEL = {
  0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'DEF', 17: 'K',
  23: 'FLEX', 3: 'WRRB_FLEX', 5: 'REC_FLEX', 7: 'SUPER_FLEX',
  20: 'BN', 21: 'IR', 24: 'TAXI',
};
const BENCH_SLOTS = new Set([20, 21, 24]);

function isPrivateError(status) {
  return status === 401 || status === 403;
}

/**
 * Build (once, cached) a lookup from the Sleeper catalog: normalized
 * name+position → sleeper id, plus team-def by abbreviation.
 */
async function getCrosswalk() {
  return cached('espn:crosswalk', DAY, async () => {
    const catalog = await sleeperProvider.getPlayerCatalog();
    const byNamePos = new Map();
    const defByTeam = new Map();
    for (const [id, p] of Object.entries(catalog)) {
      if (p.position === 'DEF') {
        if (p.team) defByTeam.set(p.team, id);
        continue;
      }
      byNamePos.set(`${normalizeName(p.name)}|${p.position}`, id);
    }
    return { byNamePos, defByTeam };
  });
}

/** Resolve one ESPN player into a Sleeper id, or a synthetic fallback. */
function resolvePlayer(espnPlayer, crosswalk, synthetic) {
  const position = POSITION[espnPlayer.defaultPositionId] ?? null;
  const team = PRO_TEAM[espnPlayer.proTeamId] ?? null;

  if (position === 'DEF') {
    const id = team ? crosswalk.defByTeam.get(team) : null;
    if (id) return id;
  } else if (position) {
    const id = crosswalk.byNamePos.get(`${normalizeName(espnPlayer.fullName)}|${position}`);
    if (id) return id;
  }

  // Unresolved: keep it as a synthetic player so the roster still renders
  // (no headshot, no projection — flagged as unpriced downstream).
  const synthId = `espn-${espnPlayer.id}`;
  synthetic[synthId] = {
    id: synthId,
    name: espnPlayer.fullName,
    position: position ?? 'NA',
    team,
    fantasyPositions: position ? [position] : [],
    byeWeek: null,
    status: null,
    injuryStatus: null,
    number: null,
  };
  return synthId;
}

function scoringFamily(scoringSettings) {
  // statId 53 = receptions. 1=PPR, 0.5=half, 0=standard.
  const rec = (scoringSettings?.scoringItems ?? []).find((s) => s.statId === 53);
  const ppr = rec?.pointsOverrides?.[16] ?? rec?.points ?? 0;
  if (ppr >= 0.75) return 'ppr';
  if (ppr >= 0.25) return 'half-ppr';
  return 'standard';
}

/* ESPN's `displayName` is an account handle, not a person. Real leagues come
   back full of "espn40393983" and "ESPNFAN2938626819" — ESPN mints one for
   every account that never set a display name, and it was being printed under
   the team on the head-to-head as if it were a manager. The person's actual
   name is sitting right beside it in firstName/lastName, so that wins.

   When there is no real name and the handle is plainly machine-generated we
   return null rather than the handle: a team with nothing under it reads as a
   team, and a team with a serial number under it reads as a bug. */
const SYNTHETIC_HANDLE = /^espn(fan)?[0-9]+$/i;

export function memberName(member) {
  const real = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim();
  if (real) return real;
  const display = (member.displayName ?? '').trim();
  if (display && !SYNTHETIC_HANDLE.test(display)) return display;
  return null;
}

/* In ESPN's fantasy product the picture beside a team IS the team logo — there
   is no separate member avatar in any view the API exposes. `logo` carries a
   real URL whether the manager uploaded one or took a default from the logo
   pack, so both are worth showing; only an absent or non-http value is not. */
export function teamLogo(team) {
  const url = typeof team.logo === 'string' ? team.logo.trim() : '';
  return /^https?:\/\//i.test(url) ? url : null;
}

function rosterPositionsFromCounts(lineupSlotCounts = {}) {
  const positions = [];
  for (const [slotId, count] of Object.entries(lineupSlotCounts)) {
    const label = SLOT_LABEL[Number(slotId)] ?? 'BN';
    for (let i = 0; i < count; i += 1) positions.push(label);
  }
  // starters first, bench/IR last — keeps slot indexing aligned with the engine
  const order = (l) => (l === 'BN' ? 90 : l === 'IR' ? 91 : l === 'TAXI' ? 92 : 0);
  return positions.sort((a, b) => order(a) - order(b));
}

/**
 * One ESPN provider instance bound to a request's season + cookies. Holds a
 * per-request synthetic-player map shared across its method calls.
 */
export function createEspnProvider({ season, espnS2, swid }) {
  const synthetic = {};

  const espnGet = async (leagueId, views) => {
    const url = `${ESPN_BASE}/seasons/${season}/segments/0/leagues/${leagueId}?${views
      .map((v) => `view=${v}`)
      .join('&')}`;
    const headers = {};
    // Request cookies win; otherwise fall back to the server store so any
    // device works after the league's been linked once (the mobile path).
    let s2 = espnS2;
    let sw = swid;
    if (!s2 || !sw) {
      const stored = getEspnCreds(leagueId);
      if (stored) {
        s2 = stored.espnS2;
        sw = stored.swid;
      }
    }
    if (s2 && sw) {
      const cleanSwid = sw.startsWith('{') ? sw : `{${sw}}`;
      headers.Cookie = `espn_s2=${s2}; SWID=${cleanSwid}`;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const error = new Error(`espn_${response.status}`);
      error.status = response.status;
      error.isPrivate = isPrivateError(response.status);
      throw error;
    }
    return response.json();
  };

  // Whole league, cached. Cache key folds in whether we're authed (by request
  // cookie OR the server store) so a public-then-private retry doesn't serve a
  // stale 404.
  const loadLeague = (leagueId) => {
    const authed = (espnS2 && swid) || getEspnCreds(leagueId);
    return cached(`espn:league:${season}:${leagueId}:${authed ? 'auth' : 'pub'}`, 5 * MINUTE, () =>
      espnGet(leagueId, ['mSettings', 'mTeam', 'mRoster', 'mMatchup', 'mNav']),
    );
  };

  const buildTeams = async (leagueId) => {
    const [blob, crosswalk] = await Promise.all([loadLeague(leagueId), getCrosswalk()]);
    const membersById = new Map(
      (blob.members ?? []).map((m) => [m.id, memberName(m)]),
    );

    return (blob.teams ?? []).map((team) => {
      const entries = team.roster?.entries ?? [];
      const players = [];
      const starters = [];
      for (const entry of entries) {
        const espnPlayer = entry.playerPoolEntry?.player;
        if (!espnPlayer) continue;
        const id = resolvePlayer(espnPlayer, crosswalk, synthetic);
        players.push(id);
        if (!BENCH_SLOTS.has(entry.lineupSlotId)) starters.push(id);
      }
      const ownerId = team.owners?.[0] ?? null;
      const teamName =
        `${team.location ?? ''} ${team.nickname ?? ''}`.trim() ||
        team.name ||
        `Team ${team.id}`;
      return {
        rosterId: team.id,
        teamId: `${leagueId}:${team.id}`,
        ownerId,
        ownerName: ownerId ? membersById.get(ownerId) ?? null : 'Unmanaged team',
        teamName,
        avatarUrl: teamLogo(team),
        coOwners: (team.owners ?? []).slice(1),
        players,
        starters,
        reserve: [],
        record: {
          wins: team.record?.overall?.wins ?? 0,
          losses: team.record?.overall?.losses ?? 0,
          ties: team.record?.overall?.ties ?? 0,
        },
        pointsFor: team.record?.overall?.pointsFor ?? 0,
        pointsAgainst: team.record?.overall?.pointsAgainst ?? 0,
        division: team.divisionId ?? null,
      };
    });
  };

  return {
    providerId: 'espn',

    async getLeague(leagueId) {
      const blob = await loadLeague(leagueId);
      if (!blob?.settings) return null;
      const s = blob.settings;
      const playoffWeekStart =
        (s.scheduleSettings?.matchupPeriodCount ?? 14) -
          (s.scheduleSettings?.playoffMatchupPeriodLength ?? 0) || 15;
      const isKeeper = Boolean(s.draftSettings?.keeperCount) || s.type === 'KEEPER';
      return {
        id: String(leagueId),
        providerId: 'espn',
        name: s.name ?? `League ${leagueId}`,
        season: String(season),
        totalTeams: blob.teams?.length ?? s.size ?? 0,
        scoringFamily: scoringFamily(s.scoringSettings),
        hasCustomScoring: false,
        status:
          (blob.status?.currentMatchupPeriod ?? 0) > 0 ? 'in_season' : 'pre_draft',
        avatar: null,
        scoringSettings: s.scoringSettings ?? {},
        rosterPositions: rosterPositionsFromCounts(s.rosterSettings?.lineupSlotCounts),
        playoffWeekStart,
        playoffTeams: s.scheduleSettings?.playoffTeamCount ?? null,
        lastScoredWeek: Math.max(0, (blob.status?.latestScoringPeriod ?? 1) - 1),
        regularSeasonWeeks: s.scheduleSettings?.matchupPeriodCount ?? 14,
        leagueType: isKeeper ? 'keeper' : 'redraft',
        /* Already in the mSettings blob we fetch. Before a draft it is the
           only fact about the league worth printing, and we were throwing it
           away. Epoch millis; 0 means unscheduled. */
        draftAt: s.draftSettings?.date > 0 ? s.draftSettings.date : null,
        bestBall: false,
        divisions: s.scheduleSettings?.divisions?.length ?? null,
        // ESPN exposes reseeding directly on scheduleSettings. Absent -> null
        // (fixed bracket); the user can still override on the site.
        playoffReseed: s.scheduleSettings?.playoffReseed ?? null,
        // Not detected from either provider — defaults to ON when divisions exist
        // (engine), user-overridable. null = use that default.
        divisionWinnerPriority: null,
      };
    },

    getRosters(leagueId) {
      return buildTeams(leagueId);
    },

    async getUsers(leagueId) {
      // ESPN ties the team NAME to the team and the person to a member, so we
      // emit one "user" per team keyed by its owner for the generic loader.
      const teams = await buildTeams(leagueId);
      return teams.map((t) => ({
        ownerId: t.ownerId,
        ownerName: t.ownerName,
        teamName: t.teamName,
        avatarUrl: t.avatarUrl,
      }));
    },

    async getMatchups(leagueId, week) {
      const [blob, teams] = await Promise.all([loadLeague(leagueId), buildTeams(leagueId)]);
      const teamsById = new Map(teams.map((t) => [t.rosterId, t]));
      const games = (blob.schedule ?? []).filter((g) => g.matchupPeriodId === week);

      const out = [];
      games.forEach((game, index) => {
        const matchupId = game.id ?? index + 1;
        for (const side of [game.home, game.away]) {
          if (!side?.teamId) continue;
          const team = teamsById.get(side.teamId);
          if (!team) continue;
          out.push({
            matchupId,
            week,
            rosterId: side.teamId,
            points: side.totalPoints ?? 0,
            playersPoints: {},
            starters: team.starters,
            players: team.players,
          });
        }
      });
      return out;
    },

    async getTransactions() {
      return [];
    },

    async getPlayerCatalog(ids) {
      // Sleeper-resolved ids come from the shared catalog; unresolved ESPN
      // players come from this request's synthetic map.
      const base = await sleeperProvider.getPlayerCatalog(ids);
      const merged = { ...base };
      const wanted = ids ?? Object.keys(synthetic);
      for (const id of wanted) {
        if (synthetic[id]) merged[id] = synthetic[id];
      }
      return merged;
    },

    // ESPN draft import is a later pass; Draft Wrapped is off for now anyway.
    async getDrafts() {
      return [];
    },
    async getDraftPicks() {
      return [];
    },

    // NFL week/season is global, not provider-specific — reuse Sleeper's.
    getSeasonState() {
      return sleeperProvider.getSeasonState();
    },
  };
}

/**
 * Which team belongs to the person who signed in.
 *
 * ESPN's SWID cookie is not just a session artefact — it is the member's own
 * id, the same GUID that appears in `members[].id` and in every team's
 * `owners[]`. So the moment we ask "which team is yours?" we are already
 * holding the answer; we simply were not looking at it. The cookie and the
 * payload disagree about braces and case, so both are normalised before
 * comparison.
 *
 * Two cases stay a question rather than an answer, and both are real: a public
 * league needs no sign-in, so there is no SWID to match, and a person who
 * co-owns two teams in one league genuinely has to say which one they mean.
 */
export function normalizeSwid(value) {
  if (typeof value !== 'string') return null;
  const bare = value.trim().replace(/^\{+|\}+$/g, '');
  return bare ? `{${bare.toUpperCase()}}` : null;
}

export function findOwnedRosterId(teams, swid) {
  const me = normalizeSwid(swid);
  if (!me) return null;
  const owned = (teams ?? []).filter((team) =>
    [team.ownerId, ...(team.coOwners ?? [])].some((owner) => normalizeSwid(owner) === me),
  );
  return owned.length === 1 ? owned[0].rosterId : null;
}

/**
 * Connect probe: fetch a league's name + teams so the user can pick theirs.
 * Surfaces the private-league case distinctly so the UI can ask for cookies.
 */
export async function espnConnect({ season, leagueId, espnS2, swid }) {
  const provider = createEspnProvider({ season, espnS2, swid });
  const [league, teams] = await Promise.all([
    provider.getLeague(leagueId),
    provider.getRosters(leagueId),
  ]);
  if (!league) return null;
  /* The request may carry cookies, or the league may already be linked and the
     cookies living in the server store — the same fallback espnGet makes. */
  const identity = swid ?? getEspnCreds(leagueId)?.swid ?? null;
  return {
    yourRosterId: findOwnedRosterId(teams, identity),
    league: {
      id: league.id,
      name: league.name,
      season: league.season,
      totalTeams: league.totalTeams,
      scoringFamily: league.scoringFamily,
    },
    teams: teams.map((t) => ({
      rosterId: t.rosterId,
      ownerId: t.ownerId,
      teamName: t.teamName,
      ownerName: t.ownerName,
      record: t.record,
    })),
  };
}
