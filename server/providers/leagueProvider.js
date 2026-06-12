/**
 * LeagueProvider — the provider adapter contract.
 *
 * ALL league data flows through this interface. Nothing outside
 * server/providers/ may import provider-specific code, endpoints, or id
 * formats; ESPN/Yahoo providers must slot in behind the same surface.
 *
 * Every method returns provider-agnostic shapes (see §2 of the sync spec):
 *
 * @typedef {Object} ProviderUser    { id, username, displayName, avatarUrl }
 * @typedef {Object} LeagueSummary   { id, providerId, name, season, totalTeams,
 *                                     scoringFamily ('ppr'|'half-ppr'|'standard'),
 *                                     status, hasCustomScoring }
 * @typedef {Object} League          LeagueSummary + { scoringSettings, rosterPositions,
 *                                     playoffWeekStart }
 * @typedef {Object} Team            { id, leagueId, rosterId, ownerId, ownerName,
 *                                     teamName, avatarUrl, record {wins,losses,ties},
 *                                     pointsFor, pointsAgainst }
 * @typedef {Object} Roster          { teamId, rosterId, players[], starters[], reserve[] }
 * @typedef {Object} Matchup         { matchupId, week, rosterId, points, playersPoints,
 *                                     starters[] }
 * @typedef {Object} CatalogPlayer   { id, name, team, position, byeWeek, status, injuryStatus }
 * @typedef {Object} SeasonState     { season, week, displayWeek, seasonType, previousSeason }
 *
 * @typedef {Object} LeagueProvider
 * @property {string} providerId
 * @property {(username: string) => Promise<ProviderUser|null>} getUser
 * @property {(userId: string, season: string) => Promise<LeagueSummary[]>} getLeagues
 * @property {(leagueId: string) => Promise<League>} getLeague
 * @property {(leagueId: string) => Promise<Roster[]>} getRosters
 * @property {(leagueId: string) => Promise<Team[]>} getUsers
 * @property {(leagueId: string, week: number) => Promise<Matchup[]>} getMatchups
 * @property {(leagueId: string, week: number) => Promise<object[]>} getTransactions
 * @property {(ids?: string[]) => Promise<Record<string, CatalogPlayer>>} getPlayerCatalog
 * @property {() => Promise<SeasonState>} getSeasonState
 */

export {};
