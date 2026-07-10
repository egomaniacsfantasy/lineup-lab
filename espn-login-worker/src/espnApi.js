const ESPN_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

export function buildCookieHeader({ espnS2, swid }) {
  const cleanSwid = swid?.startsWith('{') ? swid : `{${String(swid ?? '').replace(/[{}]/g, '')}}`;
  return `espn_s2=${espnS2}; SWID=${cleanSwid}`;
}

export async function validateEspnSession({ leagueId, season, espnS2, swid, fetchImpl = fetch }) {
  const url = `${ESPN_BASE}/seasons/${encodeURIComponent(season)}/segments/0/leagues/${encodeURIComponent(
    leagueId,
  )}?view=mSettings&view=mTeam&view=mNav`;
  const response = await fetchImpl(url, {
    headers: { Cookie: buildCookieHeader({ espnS2, swid }) },
  });

  if (!response.ok) {
    const error = new Error(`espn_validation_${response.status}`);
    error.status = response.status;
    throw error;
  }

  const blob = await response.json();
  if (!blob?.settings || !Array.isArray(blob?.teams)) {
    throw new Error('espn_validation_malformed');
  }

  return {
    id: String(blob.id ?? leagueId),
    name: blob.settings.name ?? 'ESPN league',
    season: String(blob.seasonId ?? season),
    totalTeams: blob.settings.size ?? blob.teams.length,
  };
}
