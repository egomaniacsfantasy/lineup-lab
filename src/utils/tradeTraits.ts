/**
 * Per-manager subjective trade read (the user's private take on each opponent):
 * Trade-friendliness and Relationship, 0..10, default neutral 5. Stored locally,
 * keyed by league + roster, and fed into the acceptance-probability logistic.
 */
export interface TradeTraitRead {
  friendliness: number;
  relationship: number;
}

export const NEUTRAL_READ: TradeTraitRead = { friendliness: 5, relationship: 5 };

const clamp10 = (n: unknown) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));
const traitKey = (leagueId: string, rosterId: number) => `og.trade.traits.${leagueId}.${rosterId}`;

export function loadTradeTraits(leagueId: string, rosterId: number | null): TradeTraitRead {
  if (rosterId == null) return { ...NEUTRAL_READ };
  try {
    const raw = localStorage.getItem(traitKey(leagueId, rosterId));
    if (raw) {
      const t = JSON.parse(raw);
      return { friendliness: clamp10(t.friendliness), relationship: clamp10(t.relationship) };
    }
  } catch { /* ignore */ }
  return { ...NEUTRAL_READ };
}

export function saveTradeTraits(leagueId: string, rosterId: number | null, t: TradeTraitRead) {
  if (rosterId == null) return;
  try { localStorage.setItem(traitKey(leagueId, rosterId), JSON.stringify(t)); } catch { /* ignore */ }
}
