import type { Player, Position } from '../types';

export interface PlayerManifestEntry {
  slug: string;
  fullName: string;
  displayName: string;
  position: Position;
  team: string;
  jerseyNumber?: string;
  espnId: string | null;
  headshotUrl: string;
}

// Hand-verified against espn.com player pages on Apr 22, 2026.
// DO NOT modify any espnId without re-verifying against the corresponding espn.com player page.
// Wrong-player headshots are a credibility-killing bug. Verify before you commit.
export const PLAYER_MANIFEST = {
  'mahomes-01': {
    slug: 'mahomes-01',
    fullName: 'Patrick Mahomes',
    displayName: 'P. Mahomes',
    position: 'QB',
    team: 'KC',
    jerseyNumber: '15',
    espnId: '3139477',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png',
  },
  'adams-01': {
    slug: 'adams-01',
    fullName: 'Davante Adams',
    displayName: 'D. Adams',
    position: 'WR',
    team: 'LV',
    jerseyNumber: '17',
    espnId: '16800',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/16800.png',
  },
  'waddle-01': {
    slug: 'waddle-01',
    fullName: 'Jaylen Waddle',
    displayName: 'J. Waddle',
    position: 'WR',
    team: 'MIA',
    jerseyNumber: '17',
    espnId: '4372016',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4372016.png',
  },
  'henry-01': {
    slug: 'henry-01',
    fullName: 'Derrick Henry',
    displayName: 'D. Henry',
    position: 'RB',
    team: 'BAL',
    jerseyNumber: '22',
    espnId: '3043078',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3043078.png',
  },
  'mclaurin-01': {
    slug: 'mclaurin-01',
    fullName: 'Terry McLaurin',
    displayName: 'T. McLaurin',
    position: 'WR',
    team: 'WAS',
    jerseyNumber: '17',
    espnId: '3121422',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3121422.png',
  },
  'kirk-01': {
    slug: 'kirk-01',
    fullName: 'Christian Kirk',
    displayName: 'C. Kirk',
    position: 'WR',
    team: 'JAX',
    espnId: '3895856',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3895856.png',
  },
  'kelce-01': {
    slug: 'kelce-01',
    fullName: 'Travis Kelce',
    displayName: 'T. Kelce',
    position: 'TE',
    team: 'KC',
    jerseyNumber: '87',
    espnId: '15847',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/15847.png',
  },
  'tucker-01': {
    slug: 'tucker-01',
    fullName: 'Justin Tucker',
    displayName: 'J. Tucker',
    position: 'K',
    team: 'BAL',
    jerseyNumber: '9',
    espnId: '15683',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/15683.png',
  },
  'sf-def-01': {
    slug: 'sf-def-01',
    fullName: 'San Francisco 49ers',
    displayName: '49ers D/ST',
    position: 'DEF',
    team: 'SF',
    espnId: null,
    headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/sf.png&w=56',
  },
  'robinson-01': {
    slug: 'robinson-01',
    fullName: 'Bijan Robinson',
    displayName: 'B. Robinson',
    position: 'RB',
    team: 'ATL',
    jerseyNumber: '7',
    espnId: '4430807',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4430807.png',
  },
  'jefferson-01': {
    slug: 'jefferson-01',
    fullName: 'Justin Jefferson',
    displayName: 'J. Jefferson',
    position: 'WR',
    team: 'MIN',
    jerseyNumber: '18',
    espnId: '4262921',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4262921.png',
  },
  'chase-01': {
    slug: 'chase-01',
    fullName: "Ja'Marr Chase",
    displayName: 'J. Chase',
    position: 'WR',
    team: 'CIN',
    jerseyNumber: '1',
    espnId: '4362628',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png',
  },
  'pollard-01': {
    slug: 'pollard-01',
    fullName: 'Tony Pollard',
    displayName: 'T. Pollard',
    position: 'RB',
    team: 'TEN',
    jerseyNumber: '20',
    espnId: '3916148',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3916148.png',
  },
  'prescott-01': {
    slug: 'prescott-01',
    fullName: 'Dak Prescott',
    displayName: 'D. Prescott',
    position: 'QB',
    team: 'DAL',
    jerseyNumber: '4',
    espnId: '2577417',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/2577417.png',
  },
  'goedert-01': {
    slug: 'goedert-01',
    fullName: 'Dallas Goedert',
    displayName: 'D. Goedert',
    position: 'TE',
    team: 'PHI',
    jerseyNumber: '88',
    espnId: '3121023',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3121023.png',
  },
  'bass-01': {
    slug: 'bass-01',
    fullName: 'Tyler Bass',
    displayName: 'T. Bass',
    position: 'K',
    team: 'BUF',
    jerseyNumber: '16',
    espnId: '3917232',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3917232.png',
  },
  'dal-def-01': {
    slug: 'dal-def-01',
    fullName: 'Dallas Cowboys',
    displayName: 'Cowboys D/ST',
    position: 'DEF',
    team: 'DAL',
    espnId: null,
    headshotUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/dal.png&w=56',
  },
  'smith-01': {
    slug: 'smith-01',
    fullName: 'DeVonta Smith',
    displayName: 'D. Smith',
    position: 'WR',
    team: 'PHI',
    jerseyNumber: '6',
    espnId: '4241478',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4241478.png',
  },
  'allen-01': {
    slug: 'allen-01',
    fullName: 'Josh Allen',
    displayName: 'J. Allen',
    position: 'QB',
    team: 'BUF',
    jerseyNumber: '17',
    espnId: '3918298',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png',
  },
  'barkley-01': {
    slug: 'barkley-01',
    fullName: 'Saquon Barkley',
    displayName: 'S. Barkley',
    position: 'RB',
    team: 'PHI',
    jerseyNumber: '26',
    espnId: '3929630',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3929630.png',
  },
  'jacobs-01': {
    slug: 'jacobs-01',
    fullName: 'Josh Jacobs',
    displayName: 'J. Jacobs',
    position: 'RB',
    team: 'GB',
    jerseyNumber: '8',
    espnId: '4047365',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4047365.png',
  },
  'stevenson-01': {
    slug: 'stevenson-01',
    fullName: 'Rhamondre Stevenson',
    displayName: 'R. Stevenson',
    position: 'RB',
    team: 'NE',
    jerseyNumber: '38',
    espnId: '4569173',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4569173.png',
  },
  'ekeler-01': {
    slug: 'ekeler-01',
    fullName: 'Austin Ekeler',
    displayName: 'A. Ekeler',
    position: 'RB',
    team: 'WAS',
    jerseyNumber: '30',
    espnId: '3068267',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3068267.png',
  },
  'njoku-01': {
    slug: 'njoku-01',
    fullName: 'David Njoku',
    displayName: 'D. Njoku',
    position: 'TE',
    team: 'CLE',
    jerseyNumber: '85',
    espnId: '3123076',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/3123076.png',
  },
  'addison-01': {
    slug: 'addison-01',
    fullName: 'Jordan Addison',
    displayName: 'J. Addison',
    position: 'WR',
    team: 'MIN',
    jerseyNumber: '3',
    espnId: '4429205',
    headshotUrl: 'https://a.espncdn.com/i/headshots/nfl/players/full/4429205.png',
  },
} satisfies Record<string, PlayerManifestEntry>;

export type PlayerSlug = keyof typeof PLAYER_MANIFEST;

const PLAYER_MANIFEST_LOOKUP = PLAYER_MANIFEST as Record<string, PlayerManifestEntry>;

export function getPlayerManifestEntry(slug: string) {
  return PLAYER_MANIFEST_LOOKUP[slug] ?? null;
}

export function getManifestHeadshotUrl(slug: string) {
  return getPlayerManifestEntry(slug)?.headshotUrl ?? '';
}

export function getManifestInitials(slug: string, fallbackName = '') {
  const entry = getPlayerManifestEntry(slug);
  const source = entry?.displayName ?? fallbackName;

  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');
}

export function playerFromManifest(
  slug: PlayerSlug,
  {
    bye,
    injuryStatus,
    isActive = true,
    teamLogoUrl,
  }: {
    bye: number;
    teamLogoUrl: string;
    injuryStatus?: string;
    isActive?: boolean;
  },
): Player {
  const entry: PlayerManifestEntry = PLAYER_MANIFEST[slug];

  return {
    id: entry.slug,
    slug: entry.slug,
    name: entry.fullName,
    shortName: entry.displayName,
    position: entry.position,
    team: entry.team,
    headshotUrl: entry.headshotUrl,
    teamLogoUrl,
    bye,
    isActive,
    injuryStatus,
    jerseyNumber: entry.jerseyNumber,
  };
}
