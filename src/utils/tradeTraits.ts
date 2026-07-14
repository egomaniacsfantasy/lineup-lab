/**
 * Per-manager subjective trade read (the user's private take on each opponent):
 * Trade-friendliness and Relationship, 0..10, default neutral 5. Stored locally,
 * keyed by league + roster, and fed into the acceptance-probability logistic.
 */
export interface TradeTraitRead {
  friendliness: number;
  relationship: number;
  mode?: 'override' | 'default';
}

export const NEUTRAL_READ: TradeTraitRead = { friendliness: 5, relationship: 5 };
export type TradeReadSource = 'neutral' | 'scouted' | 'override';

export interface ResolvedTradeTraitRead extends TradeTraitRead {
  hasOverride: boolean;
  source: TradeReadSource;
  suggested: TradeTraitRead;
}

const clamp10 = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
const traitKey = (leagueId: string, rosterId: number) => `og.trade.traits.${leagueId}.${rosterId}`;

function clampRead(value: unknown): TradeTraitRead {
  const next = value as Partial<TradeTraitRead> | null;
  return {
    friendliness: clamp10(next?.friendliness),
    relationship: clamp10(next?.relationship),
    mode: next?.mode === 'default' ? 'default' : 'override',
  };
}

export function loadTradeTraitsRecord(leagueId: string, rosterId: number | null): TradeTraitRead | null {
  if (rosterId == null) return null;
  try {
    const raw = localStorage.getItem(traitKey(leagueId, rosterId));
    if (raw) {
      return clampRead(JSON.parse(raw));
    }
  } catch { /* ignore */ }
  return null;
}

export function loadTradeTraits(leagueId: string, rosterId: number | null): TradeTraitRead {
  const stored = loadTradeTraitsRecord(leagueId, rosterId);
  if (stored) return stored;
  return { ...NEUTRAL_READ };
}

export function saveTradeTraits(leagueId: string, rosterId: number | null, t: TradeTraitRead) {
  if (rosterId == null) return;
  try {
    localStorage.setItem(
      traitKey(leagueId, rosterId),
      JSON.stringify({
        friendliness: clamp10(t.friendliness),
        relationship: clamp10(t.relationship),
        mode: t.mode === 'default' ? 'default' : 'override',
      }),
    );
  } catch { /* ignore */ }
}

export function clearTradeTraitsOverride(leagueId: string, rosterId: number | null) {
  if (rosterId == null) return;
  try {
    localStorage.removeItem(traitKey(leagueId, rosterId));
  } catch {
    // ignore
  }
}

export function resolveTradeTraits(
  leagueId: string,
  rosterId: number | null,
  suggested: TradeTraitRead,
  useScouting: boolean,
): ResolvedTradeTraitRead {
  const neutralSuggested = { ...NEUTRAL_READ };
  const defaultSuggested = useScouting ? clampRead(suggested) : neutralSuggested;
  const stored = loadTradeTraitsRecord(leagueId, rosterId);

  if (!stored) {
    return {
      ...defaultSuggested,
      source: useScouting ? 'scouted' : 'neutral',
      hasOverride: false,
      suggested: defaultSuggested,
    };
  }

  if (stored.mode === 'default') {
    return {
      ...defaultSuggested,
      source: useScouting ? 'scouted' : 'neutral',
      hasOverride: false,
      suggested: defaultSuggested,
    };
  }

  return {
    friendliness: stored.friendliness,
    relationship: stored.relationship,
    mode: 'override',
    source: 'override',
    hasOverride: true,
    suggested: defaultSuggested,
  };
}
