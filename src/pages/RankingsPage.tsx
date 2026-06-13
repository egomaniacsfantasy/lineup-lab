import { useEffect, useMemo, useState } from 'react';
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { RankingMechanic } from '../components/rankings/RankingMechanic';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { toPlayer } from '../adapters/connectedLeague';
import './RankingsPage.css';

interface ModelRanking {
  rank: number;
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  mean: number;
  seasonTotal: number | null;
  weekly: Record<string, number>;
  tier: number | null;
  derived: boolean;
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
type PositionFilter = (typeof POSITIONS)[number];

// "Season" = per-game average; otherwise a specific week's projection.
type Scope = 'season' | number;

export function RankingsPage() {
  const { bootstrap } = useLeagueConnection();
  const [model, setModel] = useState<{ version: string; rankings: ModelRanking[] } | null>(null);
  const [position, setPosition] = useState<PositionFilter>('ALL');
  const [scope, setScope] = useState<Scope>('season');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!bootstrap) return;
    let cancelled = false;
    fetch('/api/rankings?limit=800')
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload.available) {
          setModel({ version: payload.version, rankings: payload.rankings });
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  // The set of weeks the model actually has (so we never offer a bye week).
  const weeks = useMemo(() => {
    const set = new Set<number>();
    (model?.rankings ?? []).forEach((r) =>
      Object.keys(r.weekly ?? {}).forEach((w) => set.add(Number(w))),
    );
    return [...set].sort((a, b) => a - b);
  }, [model]);

  // Season view ranks by TOTAL points; a specific week shows that week's
  // projection.
  const valueOf = (row: ModelRanking) =>
    scope === 'season' ? row.seasonTotal ?? null : row.weekly?.[String(scope)] ?? null;

  const rows = useMemo(() => {
    if (!model) return [];
    const q = query.trim().toLowerCase();
    return model.rankings
      .filter((r) => (position === 'ALL' ? true : r.position === position))
      .filter((r) => (q ? r.name.toLowerCase().includes(q) : true))
      .map((r) => ({ ...r, value: valueOf(r) }))
      .filter((r) => r.value != null)
      .sort((a, b) => (b.value as number) - (a.value as number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, position, scope, query]);

  if (!bootstrap) {
    return (
      <div className="rankings-page">
        <h1 className="visually-hidden">Rankings</h1>
        <RankingMechanic />
      </div>
    );
  }

  return (
    <div className="rankings-page rankings-page--model">
      <header className="rankings-model__head">
        <div>
          <p className="rankings-model__kicker">Olympus model{model ? ` · ${model.version}` : ''}</p>
          <h1 className="rankings-model__title">Player rankings</h1>
        </div>
        <input
          className="rankings-model__search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players"
          type="search"
          value={query}
        />
      </header>

      <div className="rankings-model__controls">
        <div className="rankings-model__positions">
          {POSITIONS.map((pos) => (
            <button
              className={position === pos ? 'rankings-model__pos rankings-model__pos--on' : 'rankings-model__pos'}
              key={pos}
              onClick={() => setPosition(pos)}
              type="button"
            >
              {pos}
            </button>
          ))}
        </div>

        <div className="rankings-model__scope">
          <button
            className={scope === 'season' ? 'rankings-model__week rankings-model__week--on' : 'rankings-model__week'}
            onClick={() => setScope('season')}
            type="button"
          >
            Season
          </button>
          {weeks.map((w) => (
            <button
              className={scope === w ? 'rankings-model__week rankings-model__week--on' : 'rankings-model__week'}
              key={w}
              onClick={() => setScope(w)}
              type="button"
            >
              W{w}
            </button>
          ))}
        </div>
      </div>

      <div className="rankings-model__table">
        <div className="rankings-model__row rankings-model__row--head">
          <span>#</span>
          <span>Player</span>
          <span className="rankings-model__num">
            {scope === 'season' ? 'Total' : `Wk ${scope}`}
          </span>
        </div>

        {model ? (
          rows.map((row, index) => (
            <div className="rankings-model__row" key={row.playerId}>
              <span className="rankings-model__rank">{index + 1}</span>
              <span className="rankings-model__player">
                <PlayerHeadshot
                  className="rankings-model__headshot"
                  fallbackClassName="rankings-model__headshot-fallback"
                  imageClassName="rankings-model__headshot-image"
                  player={toPlayer(row.playerId, bootstrap.players)}
                />
                <span className="rankings-model__player-copy">
                  <span className="rankings-model__name">{row.name}</span>
                  <span className="rankings-model__meta">
                    {row.position}
                    {row.team ? ` · ${row.team}` : ''}
                    {row.derived ? ' · est.' : ''}
                  </span>
                </span>
              </span>
              <span className="rankings-model__num rankings-model__value">
                {(row.value as number).toFixed(1)}
              </span>
            </div>
          ))
        ) : (
          <p className="rankings-model__empty">Loading the model…</p>
        )}

        {model && rows.length === 0 ? (
          <p className="rankings-model__empty">No players match.</p>
        ) : null}
      </div>
    </div>
  );
}
