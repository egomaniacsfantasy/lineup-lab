import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import {
  fetchPlayerDistribution,
  type PlayerDistribution as Dist,
} from '../../services/leagueApi';
import './PlayerDistribution.css';

interface PlayerDistributionProps {
  playerId: string;
  week: number;
  name: string;
  onClose: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Over/under panel for one player's week: a probability histogram plus a
 * line-by-line ladder of "chance he clears X". Priced off the same asymmetric
 * (split-normal) distribution the matchup sims draw from, so a rung here and the
 * headline matchup odds always agree.
 */
export function PlayerDistribution({ playerId, week, name, onClose }: PlayerDistributionProps) {
  const { stored } = useLeagueConnection();
  const [dist, setDist] = useState<Dist | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  const leagueId = stored?.leagueId ?? null;
  const userId = stored?.userId ?? null;

  useEffect(() => {
    let alive = true;
    setState('loading');
    if (!leagueId) {
      setState('error');
      return;
    }
    fetchPlayerDistribution(leagueId, playerId, week, userId)
      .then((d) => {
        if (!alive) return;
        setDist(d);
        setState('ready');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, [leagueId, userId, playerId, week]);

  const maxProb = useMemo(
    () => (dist?.histogram ?? []).reduce((m, b) => Math.max(m, b.prob), 0) || 1,
    [dist],
  );

  const step = dist?.step ?? 0.5;

  return createPortal(
    <div
      className="player-dist__scrim"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="player-dist"
        role="dialog"
        aria-label={`${name} scoring distribution`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="player-dist__head">
          <div>
            <h3 className="player-dist__name">{name}</h3>
            <p className="player-dist__sub">Week {week} scoring odds</p>
          </div>
          <button className="player-dist__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        {state === 'loading' && <p className="player-dist__msg">Pricing lines...</p>}
        {state === 'error' && <p className="player-dist__msg">Could not load this player&apos;s odds.</p>}
        {state === 'ready' && dist && !dist.available && (
          <p className="player-dist__msg">
            {dist.reason === 'locked'
              ? 'This game is final, so the score is locked.'
              : 'No projection this week (out, on bye, or unpriced).'}
          </p>
        )}

        {state === 'ready' && dist?.available && dist.histogram && dist.ladder && (
          <>
            <div className="player-dist__stats">
              <span className="player-dist__stat player-dist__stat--proj">
                <b>{dist.mean?.toFixed(1)}</b> proj
              </span>
              <span className="player-dist__stat">{dist.floor?.toFixed(1)} floor</span>
              <span className="player-dist__stat">{dist.ceiling?.toFixed(1)} ceiling</span>
            </div>

            <div className="player-dist__hist" role="img" aria-label="Probability histogram from floor to ceiling">
              {dist.histogram.map((b) => {
                const isProj = dist.mean != null && dist.mean >= b.lo && dist.mean < b.hi;
                return (
                  <div
                    key={b.lo}
                    className="player-dist__bar-wrap"
                    title={`${b.lo.toFixed(1)} to ${b.hi.toFixed(1)}: ${(b.prob * 100).toFixed(1)}%`}
                  >
                    <div
                      className={`player-dist__bar${isProj ? ' player-dist__bar--proj' : ''}`}
                      style={{ height: `${Math.max(2, (b.prob / maxProb) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="player-dist__axis">
              <span>{dist.floor?.toFixed(0)}</span>
              <span className="player-dist__axis-proj">{dist.mean?.toFixed(1)}</span>
              <span>{dist.ceiling?.toFixed(0)}</span>
            </div>

            <div className="player-dist__ladder-wrap">
              <table className="player-dist__ladder">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Over</th>
                    <th>Under</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.ladder.map((r) => {
                    const nearProj =
                      dist.mean != null && Math.abs(r.line - dist.mean) < step / 2 + 1e-6;
                    return (
                      <tr key={r.line} className={nearProj ? 'player-dist__row--proj' : ''}>
                        <td>{r.line.toFixed(1)}</td>
                        <td className="player-dist__over">{(r.over * 100).toFixed(0)}%</td>
                        <td className="player-dist__under">{(r.under * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="player-dist__foot">
              80% band ({dist.floor?.toFixed(1)} to {dist.ceiling?.toFixed(1)}), same model the
              matchup odds use.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
