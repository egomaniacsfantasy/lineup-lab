export function parseEspnLeagueId(raw: string) {
  const value = raw.trim();
  if (!value) return '';

  const direct = value.match(/^\d{3,}$/);
  if (direct) return direct[0];

  try {
    const url = new URL(value);
    const leagueId = url.searchParams.get('leagueId') ?? url.searchParams.get('leagueid');
    if (leagueId && /^\d+$/.test(leagueId)) return leagueId;
  } catch {
    // Fall through to liberal regex parsing.
  }

  const queryMatch = value.match(/leagueId\s*=\s*(\d+)/i);
  if (queryMatch?.[1]) return queryMatch[1];

  const pathMatch = value.match(/(?:leagueId|leagues?)\/(\d+)/i);
  return pathMatch?.[1] ?? '';
}

export function parseEspnCookiePaste(raw: string) {
  const text = raw.trim();
  if (!text) return null;

  const s2 =
    text.match(/(?:^|[;\s])espn_s2\s*=\s*([^;\s]+)/i)?.[1] ??
    text.match(/"espn_s2"\s*:\s*"([^"]+)"/i)?.[1] ??
    text.match(/espn_s2[^A-Za-z0-9_-]+([A-Za-z0-9_%.-]{20,})/i)?.[1];

  const swidRaw =
    text.match(/(?:^|[;\s])SWID\s*=\s*(\{?[^;\s}]+}?)/i)?.[1] ??
    text.match(/"SWID"\s*:\s*"([^"]+)"/i)?.[1] ??
    text.match(/SWID[^A-Za-z0-9{_-]+(\{?[A-Za-z0-9-]+}?)/i)?.[1];

  if (!s2 || !swidRaw) return null;

  const swid = swidRaw.startsWith('{') ? swidRaw : `{${swidRaw.replace(/[{}]/g, '')}}`;
  return {
    espnS2: decodeURIComponent(s2),
    swid: decodeURIComponent(swid),
  };
}

export const espnLoginEnabled = import.meta.env.VITE_ESPN_LOGIN_ENABLED === 'true';
