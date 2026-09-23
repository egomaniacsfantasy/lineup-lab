import { useEffect, useState } from 'react';

import {
  setEspnLineup,
  getAutopilotState,
  setAutopilotState,
  type SetLineupMove,
  type AutopilotState,
} from '../../services/leagueApi';
import './SetLineupButton.css';

type Phase = 'idle' | 'loading' | 'preview' | 'applying' | 'done' | 'error';

/**
 * ESPN-only: preview the optimal-lineup moves, then (on explicit confirm) POST
 * them to the real ESPN team. ESPN has no dry-run, so the preview is computed
 * server-side and nothing is written until "Apply".
 */
export function SetLineupButton({ leagueId, userId }: { leagueId: string; userId: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [moves, setMoves] = useState<SetLineupMove[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [autoLast, setAutoLast] = useState<AutopilotState['lastResult']>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAutopilotState(leagueId)
      .then((state) => {
        if (cancelled) return;
        setAutoEnabled(state.enabled);
        setAutoLast(state.lastResult ?? null);
      })
      .catch(() => {
        if (!cancelled) setAutoEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const toggleAutopilot = async () => {
    if (autoBusy || autoEnabled === null) return;
    setAutoBusy(true);
    try {
      const res = await setAutopilotState(leagueId, { userId, enabled: !autoEnabled });
      setAutoEnabled(res.enabled);
    } catch {
      /* leave the toggle where it was */
    } finally {
      setAutoBusy(false);
    }
  };

  const preview = async () => {
    setPhase('loading');
    setMessage(null);
    try {
      const res = await setEspnLineup(leagueId, { userId, confirm: false });
      if (!res.available) {
        setPhase('error');
        setMessage(res.reason === 'unsupported_provider' ? 'Only ESPN leagues can auto-set the lineup for now.' : 'Could not read your lineup.');
        return;
      }
      if ((res.count ?? 0) === 0) {
        setPhase('done');
        setMessage('Your lineup is already optimal.');
        return;
      }
      setMoves(res.moves ?? []);
      setPhase('preview');
    } catch {
      setPhase('error');
      setMessage('Could not reach ESPN. Try again.');
    }
  };

  const apply = async () => {
    setPhase('applying');
    try {
      const res = await setEspnLineup(leagueId, { userId, confirm: true });
      if (res.applied) {
        setPhase('done');
        setMessage(`Set ${res.count} change${res.count === 1 ? '' : 's'} on ESPN.`);
      } else {
        setPhase('error');
        setMessage(res.reason === 'already_optimal' ? 'Already optimal.' : 'ESPN rejected the change. Your lineup was not modified.');
      }
    } catch {
      setPhase('error');
      setMessage('ESPN rejected the change. Your lineup was not modified.');
    }
  };

  return (
    <div className="set-lineup">
      {phase === 'idle' || phase === 'loading' ? (
        <button className="set-lineup__btn" disabled={phase === 'loading'} onClick={preview} type="button">
          {phase === 'loading' ? 'Checking your lineup...' : 'Set optimal lineup on ESPN'}
        </button>
      ) : null}

      {phase === 'preview' ? (
        <div className="set-lineup__panel">
          <p className="set-lineup__title">This will change your real ESPN lineup:</p>
          <ul className="set-lineup__moves">
            {moves.map((move, i) => (
              <li className="set-lineup__move" key={`${move.name}-${i}`}>
                <strong>{move.name}</strong>: {move.from} {'→'} {move.to}
              </li>
            ))}
          </ul>
          <div className="set-lineup__actions">
            <button className="set-lineup__btn set-lineup__btn--go" onClick={apply} type="button">
              Apply to ESPN
            </button>
            <button className="set-lineup__btn set-lineup__btn--ghost" onClick={() => setPhase('idle')} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'applying' ? <p className="set-lineup__note">Applying to ESPN...</p> : null}

      {(phase === 'done' || phase === 'error') && message ? (
        <div className={['set-lineup__result', phase === 'error' ? 'set-lineup__result--error' : ''].filter(Boolean).join(' ')}>
          <span>{message}</span>
          <button className="set-lineup__btn set-lineup__btn--ghost" onClick={() => setPhase('idle')} type="button">
            Done
          </button>
        </div>
      ) : null}

      {autoEnabled !== null ? (
        <label className="set-lineup__auto">
          <input checked={autoEnabled} disabled={autoBusy} onChange={toggleAutopilot} type="checkbox" />
          <span className="set-lineup__auto-copy">
            <span className="set-lineup__auto-title">Autopilot: keep my lineup optimal</span>
            <span className="set-lineup__auto-note">
              {autoEnabled
                ? autoLast?.applied
                  ? `On. Last auto-set ${autoLast.count ?? 0} change${autoLast.count === 1 ? '' : 's'}.`
                  : 'On. We re-check hourly and set your best lineup before games lock.'
                : 'Off. Let Odds Gods set your best lineup for you, automatically.'}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
