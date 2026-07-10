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

export function buildEspnLaunchCode(returnUrl) {
  const target = JSON.stringify(String(returnUrl || ''));
  const script = `(() => {
    const send = ${target};
    const onEspn = /(^|\\.)fantasy\\.espn\\.com$/i.test(location.hostname);
    if (!onEspn) {
      alert('Open your ESPN fantasy league first, then run the Odds Gods code again.');
      return;
    }
    const blob = document.cookie || '';
    const leagueId = new URLSearchParams(location.search).get('leagueId') || '';
    const seasonId = new URLSearchParams(location.search).get('seasonId') || '';
    const hasBoth = /espn_s2=/i.test(blob) && /SWID=/i.test(blob);
    const url = new URL(send);
    if (leagueId) url.searchParams.set('espnLeagueId', leagueId);
    if (seasonId) url.searchParams.set('espnSeason', seasonId);
    url.searchParams.set('espnCapture', blob);
    if (hasBoth) {
      location.href = url.toString();
      return;
    }
    navigator.clipboard?.writeText(blob).finally(() => {
      alert('ESPN did not expose everything Odds Gods needs on this page. Return to Odds Gods; the paste box will tell you exactly what is missing.');
      location.href = url.toString();
    });
  })()`;
  return `javascript:${script.replace(/\s+/g, ' ')}`;
}

export const espnLoginEnabled = import.meta.env?.VITE_ESPN_LOGIN_ENABLED !== 'false';
