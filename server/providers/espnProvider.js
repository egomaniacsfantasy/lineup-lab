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
import { anyGameLive } from '../live/nflGameStatus.js';
import { LIVE_MATCHUP_TTL_MS } from '../gameWindows.js';

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

/* How a lineup should read, which is not the order ESPN numbers its slots.
   Sorting by raw slot id puts FLEX (23) below D/ST (16) and K (17), so the
   flex spot rendered under the kicker. Everyone writes a lineup with the flex
   attached to the skill players it draws from and the two specialists last.

   Both the slot labels and the starters are sorted by this, and they have to
   stay that way: the engine pairs starters[i] with rosterPositions[i], and a
   swap is legal or illegal on the strength of that pairing. */
const SLOT_DISPLAY_ORDER = [
  'QB', 'SUPER_FLEX', 'RB', 'WR', 'TE', 'WRRB_FLEX', 'REC_FLEX', 'FLEX', 'DEF', 'K',
];
const slotRank = (label) => {
  const index = SLOT_DISPLAY_ORDER.indexOf(label);
  return index === -1 ? SLOT_DISPLAY_ORDER.length : index;
};

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

/* One player's ACTUAL fantasy points for a scoring period, from ESPN's stats[].
   stats[] entries: statSourceId 0 = actual, 1 = projected; statSplitTypeId 1 =
   a single scoring period (not season-to-date). We want the actual single-week
   total for the given period — ESPN updates this live as a game is played, so it
   serves both mid-game and final. Returns null when ESPN has published nothing
   (pre-game / off-season). */
export function actualAppliedTotal(espnPlayer, scoringPeriodId) {
  const stats = espnPlayer?.stats ?? [];
  for (const s of stats) {
    if (Number(s?.statSourceId) !== 0) continue;
    if (Number(s?.scoringPeriodId) !== Number(scoringPeriodId)) continue;
    if (s?.statSplitTypeId != null && Number(s.statSplitTypeId) !== 1) continue;
    if (typeof s?.appliedTotal === 'number') return s.appliedTotal;
  }
  return null;
}

/* Per-player points for one matchup side, keyed by the SAME resolved id the
   lineup uses (resolvePlayer), so the live overlay + applyLiveLocks line up with
   the projection map. Reads the roster the mMatchup view already carries (no
   extra fetch). Empty when ESPN has published no scores yet, which keeps the
   live path a no-op exactly as before.

   Structurally verified against the mMatchup schema; UNTESTED against a real
   in-game payload until live games (same caveat as the rest of the live stack). */
export function playersPointsForSide(roster, scoringPeriodId, crosswalk, synthetic) {
  const out = {};
  for (const entry of roster?.entries ?? []) {
    const espnPlayer = entry?.playerPoolEntry?.player;
    if (!espnPlayer) continue;
    const id = resolvePlayer(espnPlayer, crosswalk, synthetic);
    let pts = actualAppliedTotal(espnPlayer, scoringPeriodId);
    // Fallback: ESPN populates appliedStatTotal on the current-period entry.
    if (pts == null && typeof entry.playerPoolEntry?.appliedStatTotal === 'number') {
      pts = entry.playerPoolEntry.appliedStatTotal;
    }
    if (typeof pts === 'number') out[id] = pts;
  }
  return out;
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

/**
 * Put a team's starters in the order the league declares its slots.
 *
 * The engine reads a lineup positionally: starters[i] is understood to occupy
 * rosterPositions[i], and that pairing is what decides whether a swap is legal.
 * ESPN returns roster entries in its own order, which is not slot order, so
 * taking them as they arrive paired every starter with a label that was not
 * theirs. A defence landing on a flex label is how the board came to offer a
 * running back for the D/ST slot.
 *
 * rosterPositionsFromCounts emits starter labels in ascending ESPN slot id, so
 * sorting starters the same way is what makes the two agree. Ties (two RB slots
 * both id 2) keep entry order, which is arbitrary but stable, and either back is
 * equally legal in either back's slot.
 */
export function orderStartersBySlot(startingEntries) {
  return (startingEntries ?? [])
    .map((entry, index) => ({
      ...entry,
      index,
      rank: slotRank(SLOT_LABEL[entry.lineupSlotId]),
    }))
    .sort((a, b) => a.rank - b.rank || a.lineupSlotId - b.lineupSlotId || a.index - b.index)
    .map((entry) => entry.id);
}

function rosterPositionsFromCounts(lineupSlotCounts = {}) {
  const positions = [];
  for (const [slotId, count] of Object.entries(lineupSlotCounts)) {
    const label = SLOT_LABEL[Number(slotId)] ?? 'BN';
    for (let i = 0; i < count; i += 1) positions.push(label);
  }
  /* Starters in reading order, bench and IR last. The starter half has to come
     out in exactly the order orderStartersBySlot produces, or every starter is
     paired with somebody else's slot. */
  const order = (l) =>
    l === 'BN' ? 90 : l === 'IR' ? 91 : l === 'TAXI' ? 92 : slotRank(l);
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
    /* ESPN answering slowly must not hold our own request open indefinitely:
       without this an upstream stall becomes our stall, and the client sees a
       spinner rather than an error it can act on. */
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
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

  /* Live scores only. The full league blob (settings/teams/rosters) is static
     during a game and stays on its 5-min cache; this pulls JUST the scoreboard-
     bearing view (schedule[].home/away rosters + status) on the short live TTL
     (LIVE_MATCHUP_TTL_MS, sized just under the ~90s live cycle) so the live loop
     sees fresh player points. Only ever called while a game is live, so it adds
     no ESPN load pre-game / off-season. */
  const loadLiveScores = (leagueId) => {
    const authed = (espnS2 && swid) || getEspnCreds(leagueId);
    return cached(
      `espn:live:${season}:${leagueId}:${authed ? 'auth' : 'pub'}`,
      LIVE_MATCHUP_TTL_MS,
      () => espnGet(leagueId, ['mMatchup']),
    );
  };

  /* Separate from loadLeague on purpose: the draft blob is big, it is frozen
     the moment the draft ends, and folding it into the league view would make
     every roster read pay for it. Cached long for the same reason.

     (loadLiveScores above pulls just the scoreboard view on the ~90s live TTL so
     the live loop sees fresh player points without re-pulling the league blob.) */
  const loadDraft = (leagueId) => {
    const authed = (espnS2 && swid) || getEspnCreds(leagueId);
    return cached(
      `espn:draft:${season}:${leagueId}:${authed ? 'auth' : 'pub'}`,
      6 * 60 * MINUTE,
      () => espnGet(leagueId, ['mDraftDetail']),
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
      /* The engine reads a lineup positionally: starters[i] is understood to
         sit in the slot rosterPositions[i], and that is what makes a swap legal
         or illegal. ESPN hands roster entries back in its own order, which is
         not slot order, so pushing them as they arrive misaligned every starter
         against a slot label that was not theirs. A defence landing on a flex
         label is how the board came to offer a running back for the D/ST slot.

         rosterPositionsFromCounts emits starter labels in ascending ESPN slot
         id, so ordering the starters the same way is what makes the two agree.
         Ties (two RB slots, both id 2) keep entry order, which is arbitrary but
         consistent, and either RB is equally legal in either RB slot. */
      const startingEntries = [];
      for (const entry of entries) {
        const espnPlayer = entry.playerPoolEntry?.player;
        if (!espnPlayer) continue;
        const id = resolvePlayer(espnPlayer, crosswalk, synthetic);
        players.push(id);
        if (!BENCH_SLOTS.has(entry.lineupSlotId)) {
          startingEntries.push({ id, lineupSlotId: entry.lineupSlotId ?? 99 });
        }
      }
      const starters = orderStartersBySlot(startingEntries);
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
      /* matchupPeriodCount is the length of the REGULAR season, so the
         playoffs open the week after it. This used to subtract
         playoffMatchupPeriodLength from it, which is not a meaningful
         operation: that field is how many weeks each playoff ROUND runs (1
         normally, 2 for a two-week final), not an offset. A fourteen week
         league with one week rounds came out as week 13, so the sim treated
         two real regular season weeks as playoffs and priced the season on a
         schedule the league does not play.

         The `|| 15` that used to close this line was worse than the bug: it
         quietly rewrote any zero into a plausible-looking 15, so a league whose
         settings we failed to read looked exactly like a normal one. */
      const regularSeasonWeeks = s.scheduleSettings?.matchupPeriodCount ?? 14;
      const playoffWeekStart = regularSeasonWeeks + 1;
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
        regularSeasonWeeks,
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
      const [blob, teams, crosswalk] = await Promise.all([
        loadLeague(leagueId),
        buildTeams(leagueId),
        getCrosswalk(),
      ]);
      /* While a game is live, read the schedule + per-player scores from the
         short-TTL scoreboard fetch instead of the 5-min league blob, so live
         points move every cycle. Teams/starters stay on the static blob (they
         don't change mid-game). Off-game reads are unchanged. */
      const scoreBlob = anyGameLive() ? await loadLiveScores(leagueId) : blob;
      const status = scoreBlob.status ?? blob.status;
      const teamsById = new Map(teams.map((t) => [t.rosterId, t]));
      const games = (scoreBlob.schedule ?? []).filter((g) => g.matchupPeriodId === week);

      /* For the CURRENT week we read the live current-scoring-period roster and
         its period; for past weeks the matchup-period roster and that week. In a
         normal (1-week) regular-season matchup the scoring period == the week. */
      const isCurrentWeek = week === (status?.currentMatchupPeriod ?? week);
      const scoringPeriodId = isCurrentWeek
        ? (status?.currentScoringPeriod ?? week)
        : week;
      const rosterFor = (side) =>
        isCurrentWeek
          ? side?.rosterForCurrentScoringPeriod ?? side?.rosterForMatchupPeriod
          : side?.rosterForMatchupPeriod ?? side?.rosterForCurrentScoringPeriod;
      // Synthetic bin is discarded here (getMatchups doesn't render players); its
      // only role is to give resolvePlayer a place to write unmatched ids.
      const synthetic = {};

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
            playersPoints: playersPointsForSide(
              rosterFor(side), scoringPeriodId, crosswalk, synthetic,
            ),
            starters: team.starters,
            players: team.players,
          });
        }
      });
      return out;
    },

    /**
     * ESPN's read API does not publish what was in a trade.
     *
     * Probed against a real, public league (2107153357) on 2026-08-23, which
     * had two executed trade rows. Every source ESPN offers returns the fact
     * of the trade and nothing else:
     *
     *   ?view=mTransactions2              200, 61 transactions, both TRADE
     *                                     rows have items: []
     *   /transactions/?view=mTransactions2  200, same 61, same empty items
     *   ?view=mTransactions2 + an
     *     x-fantasy-filter on TRADE_*     200, both rows, still items: []
     *   /communication/?view=
     *     kona_league_communication       401
     *
     * And across all 61 transactions, the number of items moving a player
     * from one real team to another is zero — the ROSTER rows are lineup
     * swaps, carrying fromTeamId 0 and toTeamId 0.
     *
     * So a trade's players are either behind the 401 (the league is public
     * enough to read rosters, which is not the same as being public enough to
     * read the activity feed) or not exposed at all. Distinguishing those needs
     * a signed-in cookie pair against a league that has traded, which is worth
     * doing before anyone builds trade history on ESPN — the feature is not
     * merely unimplemented here, it has no data behind it yet.
     *
     * Returning [] rather than the contentless rows on purpose: "two trades
     * happened and we cannot say what was in them" renders as a broken feature,
     * and reporting no history is the more honest of the two.
     */
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

    /* ESPN keeps the draft on the league itself: there is no separate draft
       resource and so no draft id, which is why this hands the league id back
       as one. Sleeper has real draft ids and the shared contract was written
       around them. */
    async getDrafts(leagueId) {
      const detail = (await loadDraft(leagueId))?.draftDetail;
      if (!detail) return [];
      return [
        {
          draftId: String(leagueId),
          status: detail.drafted
            ? 'complete'
            : detail.inProgress
              ? 'in_progress'
              : 'pre_draft',
          picks: (detail.picks ?? []).length,
        },
      ];
    },

    /* The draft view names players by numeric ESPN id and nothing else, while
       resolvePlayer matches on name and position. The roster view already
       carries the full player object for everyone currently rostered, so it is
       the bridge between the two.

       The gap that leaves is real and worth stating: a player drafted and then
       dropped is on nobody's roster, so there is no object to match and the
       pick resolves to a synthetic id with no name. Those are exactly the
       picks a draft recap wants to talk about, so this reports them rather
       than dropping them, and a fuller fix means pulling the player pool. */
    async getDraftPicks(draftId) {
      const leagueId = String(draftId);
      const [draftBlob, rosterBlob, crosswalk] = await Promise.all([
        loadDraft(leagueId),
        loadLeague(leagueId),
        getCrosswalk(),
      ]);
      const picks = draftBlob?.draftDetail?.picks ?? [];
      if (picks.length === 0) return [];

      const synthetic = {};
      const byEspnId = new Map();
      /* ESPN's picks name a team but never a member: memberId came back absent
         on all 180 picks of a real league. The owner has to come from the team
         the pick belongs to, which the roster view does carry. */
      const ownerByTeam = new Map();
      for (const team of rosterBlob.teams ?? []) {
        ownerByTeam.set(Number(team.id), team.owners?.[0] ?? null);
        for (const entry of team.roster?.entries ?? []) {
          const player = entry.playerPoolEntry?.player;
          if (player?.id != null) byEspnId.set(Number(player.id), player);
        }
      }

      return picks
        .map((pick) => {
          const espnPlayerId = Number(pick.playerId);
          const player = byEspnId.get(espnPlayerId);
          return {
            /* ESPN counts overall picks from 1 the way Sleeper does. */
            pickNo: pick.overallPickNumber ?? null,
            round: pick.roundId ?? null,
            draftSlot: pick.roundPickNumber ?? null,
            rosterId: pick.teamId ?? null,
            pickedBy: ownerByTeam.get(Number(pick.teamId)) ?? null,
            playerId: player
              ? resolvePlayer(player, crosswalk, synthetic)
              : `espn-${espnPlayerId}`,
            /* True for a pick that was never made from the board. */
            unresolved: !player,
            isKeeper: Boolean(pick.keeper ?? pick.reservedForKeeper),
            /* Auction leagues price picks in dollars, not slots. */
            bidAmount: pick.bidAmount ?? null,
          };
        })
        .filter((pick) => pick.pickNo != null)
        .sort((a, b) => a.pickNo - b.pickNo);
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
  /* Identity comes from the caller's own cookie and nowhere else.

     This used to fall back to the server store, the same way espnGet does. But
     espnGet is answering "may I read this league", where a shared cookie is the
     point, and this is answering "which of these teams is mine", where it is a
     cross-user identity leak: the store is keyed by league id and holds exactly
     one SWID, whoever linked the league first. A public league sends no cookie
     at all, so every member who connected after the first one was silently
     handed the first one's roster, and the client, trusting a non-null answer,
     skipped the team picker and wrote that person's ESPN member id into their
     own saved connection.

     No cookie of your own means we do not know who you are, which is a question
     for the picker and not something to guess at. */
  const identity = swid ?? null;
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
