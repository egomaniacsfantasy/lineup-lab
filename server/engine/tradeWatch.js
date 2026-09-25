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
