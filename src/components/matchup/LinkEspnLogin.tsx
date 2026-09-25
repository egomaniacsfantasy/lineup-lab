import { useState } from 'react';

import { linkEspnLogin } from '../../services/leagueApi';
import {
  CONNECTOR_STORE_URL,
  connectorSupported,
  detectConnector,
  requestEspnSession,
} from '../../utils/espnExtension';
import './LinkEspnLogin.css';

const REASONS: Record<string, string> = {
  no_session: 'You are not signed in to ESPN in this browser. Sign in at espn.com, then tap Link again.',
  different_account: 'This browser is signed in to a different ESPN account than your team. Sign in to ESPN as yourself, then tap Link again.',
  espn_rejected: 'ESPN did not accept that login. Sign out and back in at espn.com, then tap Link again.',
  league_not_found: 'ESPN could not find this league with that login.',
};

/**
 * "Link my ESPN login": reads this browser's ESPN session through the Odds Gods
 * connector and saves it under the manager, so the autopilots act as HIM. The
 * normal connect flow never asks for a login when the league is already
 * readable with a league-mate's, which is why this lives on the hub.
 */
export function LinkEspnLogin({ leagueId, userId, onLinked }: { leagueId: string; userId: string; onLinked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean; install?: boolean } | null>(null);

  const link = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!connectorSupported()) {
        setMessage({ text: 'Linking needs a computer with Chrome (one time). After that it works on your phone too.', error: true });
        return;
      }
      if (!(await detectConnector(1500))) {
        setMessage({ text: 'Install the Odds Gods ESPN connector for Chrome, sign in at espn.com, then tap Link again.', error: true, install: true });
        return;
      }
      const session = await requestEspnSession();
      if (!session.espnS2 || !session.swid) {
        setMessage({ text: REASONS.no_session, error: true });
        return;
      }
      const res = await linkEspnLogin(leagueId, { espnS2: session.espnS2, swid: session.swid, userId });
      if (res.linked) {
        setMessage({ text: 'Linked. Your autopilots now act with your own ESPN login.', error: false });
        onLinked();
      } else {
        setMessage({ text: REASONS[res.reason ?? ''] ?? 'Could not link your ESPN login. Try again.', error: true });
      }
    } catch {
      setMessage({ text: 'Could not link your ESPN login. Try again.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="link-espn">
      <button className="link-espn__btn" disabled={busy} onClick={() => void link()} type="button">
        {busy ? 'Linking...' : 'Link my ESPN login'}
      </button>
      {message ? (
        <p className={`link-espn__note${message.error ? ' link-espn__note--error' : ''}`}>
          {message.text}{' '}
          {message.install ? (
            <a href={CONNECTOR_STORE_URL} rel="noreferrer" target="_blank">
              Get the connector
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
