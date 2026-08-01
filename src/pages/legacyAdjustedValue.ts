import type { BoardRow } from '../services/leagueApi';

// LEGACY CLIENT-SIDE COMPUTATION — violates the display-verbatim rule, predates it.
// Frozen. Delete when /api/rankings exposes adjustedValue. Do not extend.

const VOR_POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

/** Roster slot tokens -> how many of each dedicated/flex slot the league starts. */
function slotCounts(slots: string[] | undefined) {
  const c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0, FLEX: 0, SF: 0, REC: 0 };
  for (const raw of slots ?? []) {
    const s = String(raw).toUpperCase();
    if (s === 'QB') c.QB += 1;
    else if (s === 'RB') c.RB += 1;
    else if (s === 'WR') c.WR += 1;
    else if (s === 'TE') c.TE += 1;
    else if (s === 'K' || s === 'PK') c.K += 1;
    else if (s === 'DEF' || s === 'DST' || s === 'D/ST') c.DEF += 1;
    else if (s === 'FLEX' || s === 'W/R/T' || s === 'WRT') c.FLEX += 1;
    else if (s === 'SUPER_FLEX' || s === 'SUPERFLEX' || s === 'Q/W/R/T') c.SF += 1;
    else if (s === 'WRRB_FLEX' || s === 'REC_FLEX' || s === 'W/R' || s === 'W/T') c.REC += 1;
  }
  return c;
}

function computeReplacement(
  board: BoardRow[],
  numTeams: number,
  slots: string[] | undefined,
): Record<string, number> {
  const T = Math.max(1, numTeams || 12);
  const c = slotCounts(slots);

  const byPos: Record<string, BoardRow[]> = {};
  for (const pos of VOR_POS) {
    byPos[pos] = board
      .filter((r) => r.position === pos && (r.seasonTotal ?? 0) > 0)
      .sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));
  }

  const dedicated: Record<string, number> = {
    QB: Math.round(T * c.QB),
    RB: Math.round(T * c.RB),
    WR: Math.round(T * c.WR),
    TE: Math.round(T * c.TE),
    K: Math.round(T * c.K),
    DEF: Math.round(T * c.DEF),
  };

  const flexPos = new Set<string>();
  if (c.FLEX) ['RB', 'WR', 'TE'].forEach((p) => flexPos.add(p));
  if (c.REC) ['WR', 'TE'].forEach((p) => flexPos.add(p));
  if (c.SF) ['QB', 'RB', 'WR', 'TE'].forEach((p) => flexPos.add(p));
  const flexSeats = Math.round(T * (c.FLEX + c.REC + c.SF));

  const leftovers: BoardRow[] = [];
  for (const pos of flexPos) {
    const list = byPos[pos] ?? [];
    for (let i = dedicated[pos] ?? 0; i < list.length; i += 1) leftovers.push(list[i]);
  }
  leftovers.sort((a, b) => (b.seasonTotal ?? 0) - (a.seasonTotal ?? 0));

  const flexTaken: Record<string, number> = {};
  for (let i = 0; i < Math.min(flexSeats, leftovers.length); i += 1) {
    const pos = leftovers[i].position;
    flexTaken[pos] = (flexTaken[pos] ?? 0) + 1;
  }

  const repl: Record<string, number> = {};
  for (const pos of VOR_POS) {
    const list = byPos[pos] ?? [];
    const started = (dedicated[pos] ?? 0) + (flexTaken[pos] ?? 0);
    if (!list.length || started <= 0) {
      repl[pos] = 0;
      continue;
    }
    const idx = Math.min(list.length - 1, started - 1);
    repl[pos] = list[idx]?.seasonTotal ?? 0;
  }

  const allTotals = board
    .map((r) => r.seasonTotal ?? 0)
    .filter((total) => total > 0)
    .sort((a, b) => b - a);
  const kdefRank = Math.max(1, Math.round(T * KDEF_BASELINE_DEPTH));
  const kdefBase = allTotals[Math.min(kdefRank, allTotals.length - 1)] ?? 0;
  repl.K = kdefBase;
  repl.DEF = kdefBase;

  return repl;
}

const POS_ALPHA: Record<string, number> = {
  QB: 0.22,
  RB: 0.34,
  WR: 0.37, // slightly above RB: PPR receptions make receivers a touch more valuable
  TE: 0.3,
  K: 0.34,
  DEF: 0.34,
};

const KDEF_BASELINE_DEPTH = 3;

export interface LegacyAdjustedValue {
  adjustedValue: number;
  vor: number;
}

export function computeLegacyAdjustedValues(
  board: BoardRow[],
  numTeams: number,
  slots: string[] | undefined,
) {
  const replacement = computeReplacement(board, numTeams, slots);
  return new Map(
    board.map((row) => {
      const total = row.seasonTotal ?? 0;
      const vor = total - (replacement[row.position] ?? 0);
      const adjustedValue = vor + (POS_ALPHA[row.position] ?? 0.34) * total;
      return [
        row.playerId,
        {
          adjustedValue,
          vor,
        } satisfies LegacyAdjustedValue,
      ];
    }),
  );
}
