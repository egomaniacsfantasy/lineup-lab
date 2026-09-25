import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  cancelTradeOffer,
  getTradeSenderState,
  saveTradeSender,
  scanTradeSenderNow,
  sendTradeOffer,
  type TradeOfferState,
  type TradeSenderOffer,
  type TradeSenderSettings,
  type TradeSenderState,
} from '../../services/leagueApi';
import { LinkEspnLogin } from './LinkEspnLogin';
import './TradeSenderPanel.css';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
const names = (players: { name: string }[]) => players.map((p) => p.name).join(', ');

function ago(at: number) {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} hr ago` : `${Math.round(hrs / 24)} d ago`;
}

const STATE_LABEL: Record<TradeOfferState, string> = {
  pending: 'Waiting on them',
  accepted: 'Accepted, processing on ESPN',
  processed: 'Trade went through',
  declined: 'Declined',
  canceled: 'Withdrawn',
  expired: 'Expired',
};

const SEND_ERRORS: Record<string, string> = {
  drop_format_pending: 'Offers that need a drop from you are not switched on yet.',
  roster_reserved: 'ESPN is holding your open roster spot for another pending trade, so this one needs a drop. Scan again (we add the drop), or withdraw the other offer.',
  trade_pending_processing: 'A trade was just accepted. New offers open up once ESPN processes it.',
  roster_changed: 'A roster changed since the scan, so this offer is no longer valid. Scan again.',
  offer_gone: 'That offer is out of date. Scan again.',
  already_sent: 'Already sent.',
  creds_stale_relink: 'ESPN signed you out. Re-link your ESPN account, then try again.',
  unsupported_provider: 'Sending offers works on ESPN leagues only.',
};

/**
 * Hub "Trade sender": the user's standing trade rules, the offers the background
 * scan found (one manager at a time, the same search as clicking a manager in the
 * Trade tab), and a Send-on-ESPN button behind an explicit confirm.
 */
export function TradeSenderPanel({ leagueId, userId }: { leagueId: string; userId: string }) {
  const [state, setState] = useState<TradeSenderState | null>(null);
  const [draft, setDraft] = useState<TradeSenderSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await getTradeSenderState(leagueId, userId);
      setState(next);
      setDraft((d) => d ?? next.settings);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [leagueId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // While a scan runs in the background, check back every few seconds.
  useEffect(() => {
    if (!state?.scanning) return undefined;
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [state?.scanning, load]);

  const playerName = useMemo(() => {
    const map = new Map((state?.myPlayers ?? []).map((p) => [p.id, p]));
    return (id: string) => map.get(id)?.name ?? id;
  }, [state?.myPlayers]);

  if (loadError && !state) return null;
  if (!state || !draft) return <p className="trade-sender__note">Loading trade sender...</p>;

  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const saveRules = async (enabled?: boolean) => {
    setSaving(true);
    try {
      const res = await saveTradeSender(leagueId, { userId, settings: draft, ...(enabled !== undefined ? { enabled } : {}) });
      setState((s) => (s ? { ...s, enabled: res.enabled, settings: res.settings, scanning: true } : s));
      setDraft(res.settings);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // Trade autopilot sends to other managers' inboxes, so turning it ON asks first.
  const setMode = async (mode: 'suggest' | 'auto') => {
    setSaving(true);
    setAutoError(null);
    try {
      const res = await saveTradeSender(leagueId, { userId, settings: { ...state.settings, mode } });
      setState((s) => (s ? { ...s, enabled: res.enabled, settings: res.settings, scanning: true } : s));
      setDraft(res.settings);
    } catch {
      setAutoError('Trade autopilot needs your own ESPN login. Open Odds Gods on a device signed in to ESPN, then try again.');
    } finally {
      setSaving(false);
      setConfirmAuto(false);
    }
  };

  const scanNow = async () => {
    await scanTradeSenderNow(leagueId, userId);
    setState((s) => (s ? { ...s, scanning: true } : s));
  };

  const send = async (offer: TradeSenderOffer) => {
    setSendingId(offer.id);
    setConfirmId(null);
    try {
      const res = await sendTradeOffer(leagueId, { userId, offerId: offer.id, confirm: true });
      if (res.sent) {
        setNotice({ id: offer.id, text: `Offer sent to ${offer.partnerName} on ESPN.`, error: false });
        await load();
      } else {
        setNotice({ id: offer.id, text: SEND_ERRORS[res.reason ?? ''] ?? 'ESPN rejected the offer. Nothing was sent.', error: true });
      }
    } catch {
      setNotice({ id: offer.id, text: 'ESPN rejected the offer. Nothing was sent.', error: true });
    } finally {
      setSendingId(null);
    }
  };

  const withdraw = async (espnTransactionId: string) => {
    setCancelingId(espnTransactionId);
    try {
      await cancelTradeOffer(leagueId, { userId, espnTransactionId });
      await load();
    } finally {
      setCancelingId(null);
    }
  };

  const s = state.settings;
  const partnerLabel = s.partners.length
    ? `${s.partners.length} manager${s.partners.length === 1 ? '' : 's'}`
    : 'every manager';

  return (
    <div className="trade-sender">
      <div className="trade-sender__head">
        <p className="trade-sender__title">Trade sender</p>
        <button className="trade-sender__link" onClick={() => setEditing((e) => !e)} type="button">
          {editing ? 'Close rules' : 'Edit rules'}
        </button>
      </div>

      <p className="trade-sender__rule">
        Trades that raise your title odds by at least <strong>{s.minYouDelta}%</strong> while the other team loses at
        most <strong>{s.maxPartnerLoss}%</strong>, with {partnerLabel}.
      </p>

      {editing ? (
        <div className="trade-sender__rules">
          <div className="trade-sender__row">
            <label className="trade-sender__field">
              <span>My title odds go up at least (%)</span>
              <input
                min={0}
                step={0.5}
                type="number"
                value={draft.minYouDelta}
                onChange={(e) => setDraft({ ...draft, minYouDelta: Number(e.target.value) })}
              />
            </label>
            <label className="trade-sender__field">
              <span>Their title odds drop at most (%)</span>
              <input
                min={0}
                step={0.5}
                type="number"
                value={draft.maxPartnerLoss}
                onChange={(e) => setDraft({ ...draft, maxPartnerLoss: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="trade-sender__field">
            <span>Autopilot sends at most this many offers per week (blank = no limit)</span>
            <input
              min={0}
              step={1}
              type="number"
              value={draft.autoCap ?? ''}
              onChange={(e) => setDraft({ ...draft, autoCap: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>

          <p className="trade-sender__label">Trade with (none picked = everyone)</p>
          <div className="trade-sender__chips">
            {state.managers.map((m) => (
              <button
                className={`trade-sender__chip${draft.partners.includes(m.rosterId) ? ' is-on' : ''}`}
                key={m.rosterId}
                onClick={() => setDraft({ ...draft, partners: toggleIn(draft.partners, m.rosterId) })}
                type="button"
              >
                {m.teamName}
              </button>
            ))}
          </div>

          <div className="trade-sender__row">
            <div>
              <p className="trade-sender__label">Positions I'll give (none = any)</p>
              <div className="trade-sender__chips">
                {POSITIONS.map((p) => (
                  <button
                    className={`trade-sender__chip${draft.givePositions.includes(p) ? ' is-on' : ''}`}
                    key={p}
                    onClick={() => setDraft({ ...draft, givePositions: toggleIn(draft.givePositions, p) })}
                    type="button"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="trade-sender__label">Positions I want (none = any)</p>
              <div className="trade-sender__chips">
                {POSITIONS.map((p) => (
                  <button
                    className={`trade-sender__chip${draft.getPositions.includes(p) ? ' is-on' : ''}`}
                    key={p}
                    onClick={() => setDraft({ ...draft, getPositions: toggleIn(draft.getPositions, p) })}
                    type="button"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="trade-sender__label">Only offer these players (none picked = anyone not protected)</p>
          <div className="trade-sender__chips">
            {state.myPlayers.map((p) => (
              <button
                className={`trade-sender__chip${draft.giveAllow.includes(p.id) ? ' is-on' : ''}`}
                disabled={draft.protect.includes(p.id)}
                key={p.id}
                onClick={() => setDraft({ ...draft, giveAllow: toggleIn(draft.giveAllow, p.id) })}
                type="button"
              >
                {p.name} <span className="trade-sender__pos">{p.position}</span>
              </button>
            ))}
          </div>

          <p className="trade-sender__label">Protected (never offered)</p>
          <div className="trade-sender__chips">
            {state.myPlayers.map((p) => (
              <button
                className={`trade-sender__chip trade-sender__chip--protect${draft.protect.includes(p.id) ? ' is-on' : ''}`}
                key={p.id}
                onClick={() =>
                  setDraft({
                    ...draft,
                    protect: toggleIn(draft.protect, p.id),
                    giveAllow: draft.giveAllow.filter((id) => id !== p.id),
                  })
                }
                type="button"
              >
                {p.name} <span className="trade-sender__pos">{p.position}</span>
              </button>
            ))}
          </div>

          <div className="trade-sender__actions">
            <button className="trade-sender__btn trade-sender__btn--go" disabled={saving} onClick={() => void saveRules()} type="button">
              {saving ? 'Saving...' : 'Save rules and scan'}
            </button>
            <button
              className="trade-sender__btn trade-sender__btn--ghost"
              onClick={() => {
                setDraft(state.settings);
                setEditing(false);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state.awaitingTrade ? (
        <p className="trade-sender__note trade-sender__note--good">
          One of your offers was accepted. We pulled your other offers and will scan again once ESPN processes the trade.
        </p>
      ) : null}

      {state.scanning ? (
        <p className="trade-sender__note">Scanning your league, one manager at a time. This can take a few minutes.</p>
      ) : state.lastScan?.error ? (
        <p className="trade-sender__note trade-sender__note--error">
          {state.lastScan.error === 'creds_stale_relink'
            ? 'ESPN signed you out. Re-link your ESPN account to keep scanning.'
            : 'The last scan did not finish. Try Scan now.'}
        </p>
      ) : state.lastScan ? (
        state.suggestions.length === 0 ? (
          <p className="trade-sender__note">No trade clears your rules right now. Try a lower minimum or a higher cap.</p>
        ) : null
      ) : (
        <p className="trade-sender__note">No scan yet. Tap Scan now, or turn on trade autopilot below.</p>
      )}

      {state.suggestions.length > 0 ? (
        <ul className="trade-sender__offers">
          {state.suggestions.map((offer) => (
            <li className="trade-sender__offer" key={offer.id}>
              <p className="trade-sender__offer-partner">{offer.partnerName}</p>
              <p className="trade-sender__offer-line">
                <span className="trade-sender__offer-tag">You give</span> {names(offer.give)}
              </p>
              <p className="trade-sender__offer-line">
                <span className="trade-sender__offer-tag">You get</span> {names(offer.get)}
              </p>
              {offer.drops?.you.length ? (
                <p className="trade-sender__offer-line">
                  <span className="trade-sender__offer-tag">You drop</span> {names(offer.drops.you)}
                </p>
              ) : null}
              {offer.drops?.youLater?.length ? (
                <p className="trade-sender__offer-line trade-sender__offer-line--muted">
                  <span className="trade-sender__offer-tag">Later</span>
                  {offer.drops.youLater.map((d) => `drop ${d.name} in week ${d.week} when ${d.whenReturns} comes off IR`).join('; ')}
                </p>
              ) : null}
              {offer.drops?.partner.length ? (
                <p className="trade-sender__offer-line trade-sender__offer-line--muted">
                  <span className="trade-sender__offer-tag">They drop</span> {names(offer.drops.partner)} (their call)
                </p>
              ) : null}
              <p className="trade-sender__offer-odds">
                Title odds: you <strong className="is-up">{fmtPct(offer.youDelta)}</strong>, them{' '}
                <strong className={offer.partnerDelta < 0 ? 'is-down' : 'is-up'}>{fmtPct(offer.partnerDelta)}</strong>
              </p>

              {offer.sent ? (
                <p className="trade-sender__sent">
                  Sent {ago(offer.sent.at)}. {STATE_LABEL[offer.sent.state ?? 'pending']}.
                </p>
              ) : !state.canSend ? (
                <p className="trade-sender__note">
                  {state.provider === 'espn'
                    ? 'Tap Link my ESPN login (below) once to send offers from here, or propose it in ESPN.'
                    : 'Propose this one in your league app.'}
                </p>
              ) : offer.drops?.you.length && !state.dropSendReady ? (
                <p className="trade-sender__note">Sending offers that need a drop from you is not switched on yet.</p>
              ) : state.awaitingTrade ? (
                <p className="trade-sender__note">Paused while your accepted trade processes.</p>
              ) : confirmId === offer.id ? (
                <div className="trade-sender__confirm">
                  <p>
                    This sends a real trade offer to {offer.partnerName} on ESPN
                    {offer.drops?.you.length ? `, and drops ${names(offer.drops.you)} if they accept` : ''}.
                  </p>
                  <div className="trade-sender__actions">
                    <button className="trade-sender__btn trade-sender__btn--go" onClick={() => void send(offer)} type="button">
                      Send offer
                    </button>
                    <button className="trade-sender__btn trade-sender__btn--ghost" onClick={() => setConfirmId(null)} type="button">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="trade-sender__btn"
                  disabled={sendingId !== null}
                  onClick={() => {
                    setNotice(null);
                    setConfirmId(offer.id);
                  }}
                  type="button"
                >
                  {sendingId === offer.id ? 'Sending...' : 'Send on ESPN'}
                </button>
              )}

              {notice?.id === offer.id ? (
                <p className={`trade-sender__note${notice.error ? ' trade-sender__note--error' : ''}`}>{notice.text}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {state.sentOffers.length > 0 ? (
        <div className="trade-sender__sent-list">
          <p className="trade-sender__label">Offers you sent</p>
          <ul className="trade-sender__offers">
            {state.sentOffers.map((r) => (
              <li className="trade-sender__sent-row" key={r.espnTransactionId ?? r.offerId}>
                <span className="trade-sender__sent-copy">
                  <strong>{r.partnerName}</strong>: {names(r.give)} for {names(r.get)}
                  <span className={`trade-sender__state trade-sender__state--${r.state ?? 'pending'}`}>
                    {r.closedBy === 'watcher_after_accept'
                      ? 'Pulled after another offer was accepted'
                      : r.closedBy === 'autopilot_value_dropped'
                        ? `Withdrawn by autopilot: now ${fmtPct(r.recheck?.youDelta ?? 0)} for you, below your ${s.minYouDelta}%`
                        : STATE_LABEL[r.state ?? 'pending']}
                  </span>
                  {(r.state ?? 'pending') === 'pending' && r.recheck ? (
                    <span className={`trade-sender__state${r.belowRules ? ' trade-sender__state--declined' : ''}`}>
                      {r.belowRules
                        ? `No longer clears your rules: now ${fmtPct(r.recheck.youDelta)} for you (was ${fmtPct(r.youDelta)}). Consider withdrawing.`
                        : `Re-checked ${ago(r.recheck.at)}: still ${fmtPct(r.recheck.youDelta)} for you.`}
                    </span>
                  ) : null}
                </span>
                {(r.state ?? 'pending') === 'pending' && r.espnTransactionId ? (
                  <button
                    className="trade-sender__btn trade-sender__btn--ghost"
                    disabled={cancelingId !== null}
                    onClick={() => void withdraw(r.espnTransactionId as string)}
                    type="button"
                  >
                    {cancelingId === r.espnTransactionId ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="trade-sender__foot">
        <span className="trade-sender__note">
          {state.lastScan?.at
            ? `Last scan ${ago(state.lastScan.at)}${state.lastScan.managers ? `, ${state.lastScan.managers} managers` : ''}`
            : ''}
        </span>
        <button className="trade-sender__btn trade-sender__btn--ghost" disabled={state.scanning} onClick={() => void scanNow()} type="button">
          Scan now
        </button>
      </div>

      {state.provider === 'espn' ? (
        <label className={`trade-sender__auto${state.canSend ? '' : ' trade-sender__auto--locked'}`}>
          <input
            checked={s.mode === 'auto'}
            disabled={saving || (!state.canSend && s.mode !== 'auto')}
            onChange={() => (s.mode === 'auto' ? void setMode('suggest') : setConfirmAuto(true))}
            type="checkbox"
          />
          <span className="trade-sender__auto-copy">
            <span className="trade-sender__auto-title">Trade autopilot: send offers that clear my rules on ESPN</span>
            <span className="trade-sender__auto-note">
              {!state.canSend && s.mode !== 'auto'
                ? 'Locked: we need your own ESPN login to send offers as you. Tap Link my ESPN login below (once, on a computer with Chrome).'
                : s.mode === 'auto'
                ? state.autoSend?.reason === 'needs_own_login'
                  ? 'Paused until we have your own ESPN login. Open Odds Gods on a device signed in to ESPN.'
                  : state.autoSend?.reason === 'weekly_cap'
                    ? `On. Weekly limit reached (${s.autoCap} sent). It resumes as the week rolls.`
                    : `On. Every 3 hours (and after each projection update) we scan and send the best offers that clear your rules${s.autoCap != null ? `, up to ${s.autoCap} a week` : ''}. Tap Scan now to check immediately. One pending offer per manager, never the same offer twice.${state.autoSend?.sent ? ` Last run sent ${state.autoSend.sent}.` : ''}`
                : 'Off. Nothing runs in the background. Tap Scan now for offers and send the ones you like.'}
            </span>
          </span>
        </label>
      ) : null}

      {state.provider === 'espn' && !state.canSend ? (
        <LinkEspnLogin leagueId={leagueId} userId={userId} onLinked={() => void load()} />
      ) : null}

      {confirmAuto ? (
        <div className="trade-sender__confirm trade-sender__confirm--auto">
          <p>
            Trade autopilot scans every 3 hours and proposes real trades to other managers on ESPN without asking you first, whenever an offer
            clears your rules ({s.minYouDelta}% for you, at most {s.maxPartnerLoss}% for them)
            {s.autoCap != null ? `, up to ${s.autoCap} a week` : ', with no weekly limit'}. Turn it on?
          </p>
          <div className="trade-sender__actions">
            <button className="trade-sender__btn trade-sender__btn--go" onClick={() => void setMode('auto')} type="button">
              Turn on trade autopilot
            </button>
            <button className="trade-sender__btn trade-sender__btn--ghost" onClick={() => setConfirmAuto(false)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {autoError ? <p className="trade-sender__note trade-sender__note--error">{autoError}</p> : null}

      {s.protect.length ? (
        <p className="trade-sender__note">Protected: {s.protect.map(playerName).join(', ')}</p>
      ) : null}
    </div>
  );
}
