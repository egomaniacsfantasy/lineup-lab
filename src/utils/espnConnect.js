export function parseEspnLeagueInput(raw) {
  const value = raw.trim();
  if (!value) return { leagueId: '', season: '' };

  const direct = value.match(/^\d{3,}$/);
  if (direct) return { leagueId: direct[0], season: '' };

  try {
    const url = new URL(value);
    const leagueId = url.searchParams.get('leagueId') ?? url.searchParams.get('leagueid') ?? '';
    const season = url.searchParams.get('seasonId') ?? url.searchParams.get('seasonid') ?? '';
    if (/^\d+$/.test(leagueId)) {
      return {
        leagueId,
        season: /^\d{4}$/.test(season) ? season : '',
      };
    }
  } catch {
    // Fall through to liberal text parsing.
  }

  const queryMatch = value.match(/leagueId\s*=\s*(\d+)/i);
  if (queryMatch?.[1]) {
    const seasonMatch = value.match(/seasonId\s*=\s*(\d{4})/i);
    return { leagueId: queryMatch[1], season: seasonMatch?.[1] ?? '' };
  }

  const pathMatch = value.match(/(?:leagueId|leagues?)\/(\d+)/i);
  if (pathMatch?.[1]) return { leagueId: pathMatch[1], season: '' };

  const runs = value.match(/\b\d{3,}\b/g) ?? [];
  const longest = runs.sort((a, b) => b.length - a.length)[0] ?? '';
  return { leagueId: longest, season: '' };
}

export function parseEspnLeagueId(raw) {
  return parseEspnLeagueInput(raw).leagueId;
}

export function parseEspnSessionPaste(raw) {
  const text = raw.trim();
  const s2 =
    text.match(/(?:^|[;\s])espn_s2\s*=\s*([^;\s]+)/i)?.[1] ??
    text.match(/"espn_s2"\s*:\s*"([^"]+)"/i)?.[1] ??
    text.match(/espn_s2[^A-Za-z0-9_-]+([A-Za-z0-9_%.-]{20,})/i)?.[1] ??
    '';

  const swidRaw =
    text.match(/(?:^|[;\s])SWID\s*=\s*(\{?[^;\s}]+}?)/i)?.[1] ??
    text.match(/"SWID"\s*:\s*"([^"]+)"/i)?.[1] ??
    text.match(/SWID[^A-Za-z0-9{_-]+(\{?[A-Za-z0-9-]+}?)/i)?.[1] ??
    '';

  const missing = [
    s2 ? null : 'espn_s2',
    swidRaw ? null : 'SWID',
  ].filter(Boolean);

  if (missing.length > 0) {
    return { creds: null, missing };
  }

  const swid = swidRaw.startsWith('{') ? swidRaw : `{${swidRaw.replace(/[{}]/g, '')}}`;
  return {
    creds: {
      espnS2: decodeURIComponent(s2),
      swid: decodeURIComponent(swid),
    },
    missing: [],
  };
}

export function parseEspnCookiePaste(raw) {
  return parseEspnSessionPaste(raw).creds;
}

export function espnSessionPasteError(missing = []) {
  const missingSet = new Set(missing);
  const missingS2 = missingSet.has('espn_s2');
  const missingSwid = missingSet.has('SWID');

  if (missingS2 && missingSwid) {
    return 'Could not find espn_s2 or SWID. Run the Odds Gods connector on your ESPN league page, then paste what it gives you.';
  }

  if (missingSwid) {
    return 'Found espn_s2 but no SWID. ESPN only exposed part of the login. Reopen your league page, run the connector again, and paste the full output.';
  }

  if (missingS2) {
    return 'Found SWID but no espn_s2. ESPN only exposed part of the login. Reopen your league page, run the connector again, and paste the full output.';
  }

  return null;
}

/* buildEspnLaunchCode was removed on 2026-08-04.
   It built an address-bar snippet that read document.cookie to find espn_s2.
   ESPN sets espn_s2 HttpOnly, so document.cookie can NEVER contain it: the
   flow could not succeed even once, and every user who followed it was told
   "ESPN did not expose everything" and dead-ended. Reading an HttpOnly cookie
   needs the connector extension or a native webview. Do not reintroduce a
   paste or address-bar capture path. */

export const espnLoginEnabled = import.meta.env?.VITE_ESPN_LOGIN_ENABLED !== 'false';
