/**
 * Pure status logic for the trade-offer watcher. ESPN's status vocabulary for
 * proposals is only partly observed (PENDING and CANCELED are captured; the
 * accept/decline side is inferred from ESPN's transaction types TRADE_ACCEPT /
 * TRADE_DECLINE / TRADE_UPHOLD / TRADE_VETO), so every signal is matched
 * loosely and the roster itself is the final word: once the players we asked
 * for sit on our team, the trade happened, whatever the feed says.
 *
 * States: pending | accepted | processed | declined | canceled | expired
 */

const CLOSED_STATUS = /CANCEL|DECLIN|REJECT|VETO|EXPIR|FAIL/i;
const ACCEPTED_STATUS = /ACCEPT|EXECUT|UPHOLD|APPROV|PROCESS/i;

/**
 * record:   one sent-offer record { espnTransactionId, partnerRosterId, give, get, expiresAt }
 * activity: trimmed ESPN transactions [{ id, type, status, relatedTransactionId, teamActions }]
 * roster:   Map(canonical id -> { teamId }) from a fresh roster read, or null
 * myTeamId: our ESPN team id
 */
export function classifyOffer(record, activity, roster, myTeamId, now = Date.now()) {
  // Roster truth first: every player we asked for is ours, every one we gave is
  // theirs -> the trade has processed.
  if (roster && record.get?.length) {
    const gotAll = record.get.every((p) => roster.get(String(p.id))?.teamId === myTeamId);
    const gaveAll = record.give.every((p) => roster.get(String(p.id))?.teamId === record.partnerRosterId);
    if (gotAll && gaveAll) return { state: 'processed', espnStatus: null };
  }

  const id = record.espnTransactionId;
  const proposal = (activity ?? []).find((t) => t.id === id) ?? null;
  const related = (activity ?? []).filter((t) => t.relatedTransactionId === id);
  const espnStatus = proposal?.status ?? null;

  const relatedTypes = related.map((t) => `${t.type ?? ''}:${t.status ?? ''}`);
  if (related.some((t) => /DECLIN|VETO/i.test(t.type ?? '')) || (espnStatus && /DECLIN|VETO|REJECT/i.test(espnStatus))) {
    return { state: 'declined', espnStatus, relatedTypes };
  }
  if (related.some((t) => /CANCEL/i.test(t.type ?? '') || /CANCEL/i.test(t.status ?? '')) && !related.some((t) => /ACCEPT/i.test(t.type ?? ''))) {
    return { state: 'canceled', espnStatus, relatedTypes };
  }
  const partnerAction = proposal?.teamActions?.[String(record.partnerRosterId)];
  if (
    related.some((t) => /ACCEPT|UPHOLD/i.test(t.type ?? '') && !CLOSED_STATUS.test(t.status ?? ''))
    || (espnStatus && ACCEPTED_STATUS.test(espnStatus))
    || (partnerAction && /ACCEPT/i.test(partnerAction))
  ) {
    return { state: 'accepted', espnStatus, relatedTypes };
  }
  if (espnStatus && CLOSED_STATUS.test(espnStatus)) {
    return { state: /EXPIR/i.test(espnStatus) ? 'expired' : 'canceled', espnStatus, relatedTypes };
  }
  // Past its expiry and ESPN never showed it accepted: treat as expired.
  if (record.expiresAt && now > record.expiresAt + 60 * 60_000) {
    return { state: 'expired', espnStatus, relatedTypes };
  }
  return { state: 'pending', espnStatus, relatedTypes };
}

const AUTO_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * Which suggested offers auto-send may send now, best first, and how many it may
 * still send this week. Rules: never an offer already sent (by id, any state,
 * so a declined package is not re-pitched), at most one PENDING offer per
 * partner, and the rolling-7-day cap counts only auto-sent offers.
 */
export function autoSendCandidates(entry, now = Date.now()) {
  const log = entry?.sent ?? [];
  const cap = Number.isFinite(entry?.settings?.autoCap) ? entry.settings.autoCap : Infinity;
  const used = log.filter((r) => r.mode === 'auto' && now - r.at < AUTO_WINDOW_MS).length;
  const everSent = new Set(log.map((r) => r.offerId));
  const busyPartners = new Set(log.filter((r) => r.state === 'pending').map((r) => r.partnerRosterId));
  const offers = [];
  for (const offer of entry?.suggestions ?? []) {
    if (offer.sent || everSent.has(offer.id) || busyPartners.has(offer.partnerRosterId)) continue;
    busyPartners.add(offer.partnerRosterId); // one per partner within this pass too
    offers.push(offer);
  }
  return { offers, remaining: Math.max(0, cap - used), used };
}

// A proposal is closed once ESPN has ANY follow-up row for it: a withdrawal
// (TRADE_PROPOSAL/CANCELED with relatedTransactionId), an accept, a decline,
// the league's uphold or veto. ESPN never rewrites the original row's own
// status (a withdrawn offer's row still reads PENDING), so this is the only
// reliable way to tell a live offer.
const TERMINAL_FOLLOWUP = /CANCEL|ACCEPT|DECLIN|UPHOLD|VETO|REJECT|EXPIR/i;

/**
 * Offers OTHER managers have sent to `myTeamId` that are still live.
 * activity: rows from getTradeActivity (read with MY login: only members of a
 * trade see its players). Returns [{ id, fromTeamId, giveEspn, getEspn,
 * proposedDate, expirationDate }] where give = what I'd send, get = what I'd receive.
 */
export function incomingOffers(activity, myTeamId, now = Date.now()) {
  const rows = activity ?? [];
  const closed = new Set(
    rows
      .filter((t) => t.relatedTransactionId && (TERMINAL_FOLLOWUP.test(t.type ?? '') || TERMINAL_FOLLOWUP.test(t.status ?? '')))
      .map((t) => t.relatedTransactionId),
  );
  const me = Number(myTeamId);
  const out = [];
  for (const t of rows) {
    if (t.type !== 'TRADE_PROPOSAL' || t.relatedTransactionId) continue; // originals only
    if (Number(t.teamId) === me) continue;                                 // mine: the watcher's job
    if (closed.has(t.id)) continue;
    if (t.status && !/PENDING/i.test(t.status)) continue;
    if (t.expirationDate && Number(t.expirationDate) < now) continue;
    const trades = (t.items ?? []).filter((i) => i.type === 'TRADE');
    const giveEspn = trades.filter((i) => Number(i.fromTeamId) === me).map((i) => i.playerId);
    const getEspn = trades.filter((i) => Number(i.toTeamId) === me).map((i) => i.playerId);
    if (!giveEspn.length && !getEspn.length) continue; // not a deal with me
    out.push({
      id: t.id,
      fromTeamId: Number(t.teamId),
      giveEspn,
      getEspn,
      proposedDate: t.proposedDate ?? null,
      expirationDate: t.expirationDate ?? null,
    });
  }
  return out;
}

/**
 * Accept or decline an incoming offer, by the SAME rules as the trade sender:
 * accept only if it raises my title odds by at least X and takes none of my
 * protected players. (The other side's loss is his own choice: he proposed it.)
 */
export function recommendIncoming({ youDelta, givePlayerIds = [] }, settings = {}) {
  const protect = new Set((settings.protect ?? []).map(String));
  const hit = givePlayerIds.map(String).filter((id) => protect.has(id));
  if (hit.length) return { action: 'decline', reason: 'protected' };
  if (youDelta == null) return { action: null, reason: 'unpriced' };
  const minYou = Number(settings.minYouDelta ?? 0);
  if (youDelta >= minYou && youDelta > 0) return { action: 'accept', reason: 'clears_rules' };
  return { action: 'decline', reason: youDelta <= 0 ? 'hurts_me' : 'below_min' };
}
