import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { toPlayer } from '../../adapters/connectedLeague';
import {
  fetchScoutingLeague,
  saveScoutingEdit,
  type ScoutingRead,
} from '../../services/leagueApi';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import styles from './ScoutingCard.module.css';

const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

const SLIDERS = [
  ['trade_appetite', 'Trade appetite'],
  ['reach_tendency', 'Reach tendency'],
  ['waiver_aggression', 'Waiver aggression'],
  ['activity', 'Activity'],
] as const;

function recordFor(read: ScoutingRead | null) {
  return read?.manager?.record ?? '0-0';
}

function avatarInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'OG';
}

function shortPlayerName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function needsText(read: ScoutingRead | null) {
  const needs = read?.traits.needs;
  const parts = [
    ...(needs?.weak ?? []).map((pos) => `Thin at ${pos}`),
    ...(needs?.surplus ?? []).map((pos) => `Surplus ${pos}`),
  ];
  return parts.join(' · ');
}

export function ScoutingCard({
  managerKey,
  onClose,
}: {
  managerKey: string | null;
  onClose: () => void;
}) {
  const { stored, bootstrap } = useLeagueConnection();
  const { user } = useAuth();
  const [reads, setReads] = useState<ScoutingRead[]>([]);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [saving, setSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [untouchables, setUntouchables] = useState<string[]>([]);
  const [favoriteTeam, setFavoriteTeam] = useState('');
  const [negotiationStyle, setNegotiationStyle] = useState<'clean' | 'counters' | 'ghosts' | ''>('');
  const [notes, setNotes] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');

  useEffect(() => {
    if (!managerKey || !stored || !user) return;
    let cancelled = false;
    fetchScoutingLeague(stored.leagueId, stored.userId, user.id)
      .then((next) => {
        if (!cancelled) setReads(next);
      })
      .catch(() => {
        if (!cancelled) setReads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [managerKey, stored, user]);

  const read = reads.find((item) => item.manager_key === managerKey) ?? null;

  useEffect(() => {
    if (!read || mode !== 'read') return;
    const nextOverrides: Record<string, number> = {};
    for (const [key] of SLIDERS) {
      const value = read.traits[key];
      if (typeof value === 'number') nextOverrides[key] = value;
    }
    setOverrides(nextOverrides);
    setUntouchables(read.edit?.untouchables ?? []);
    setFavoriteTeam(read.edit?.favorite_team ?? read.traits.team_bias?.team ?? '');
    setNegotiationStyle(read.edit?.negotiation_style ?? '');
    setNotes(read.edit?.notes ?? '');
  }, [mode, read]);

  useEffect(() => {
    if (!managerKey) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [managerKey, onClose]);

  const playerResults = useMemo(() => {
    if (!bootstrap || playerSearch.trim().length < 2) return [];
    const q = playerSearch.trim().toLowerCase();
    return Object.entries(bootstrap.players)
      .filter(([, player]) => player.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map(([id, player]) => ({ id, player }));
  }, [bootstrap, playerSearch]);

  const theirGuys = [
    ...new Set([
      ...(read?.traits.their_guys ?? []).map((player) => player.player_id),
      ...untouchables,
    ]),
  ];
  const evidenceByTrait = read
    ? new Map([...read.evidence].sort((a, b) => b.weight - a.weight).map((entry) => [entry.trait, entry.text]))
    : new Map<string, string>();
  const resolvedTheirGuys = theirGuys
    .map((id) => {
      const player = bootstrap?.players[id];
      if (!player || !bootstrap) return null;
      return {
        id,
        isLocked: untouchables.includes(id),
        model: toPlayer(id, bootstrap.players),
        name: shortPlayerName(player.name),
      };
    })
    .filter((player): player is NonNullable<typeof player> => Boolean(player));

  const save = async () => {
    if (!stored || !user || !managerKey) return;
    setSaving(true);
    try {
      await saveScoutingEdit(stored.leagueId, managerKey, user.id, {
        overrides,
        untouchables,
        favorite_team: favoriteTeam || null,
        negotiation_style: negotiationStyle || null,
        notes: notes.trim() || null,
      });
      const next = await fetchScoutingLeague(stored.leagueId, stored.userId, user.id);
      setReads(next);
      setMode('read');
    } finally {
      setSaving(false);
    }
  };

  const display = read?.manager;
  const teamTag = favoriteTeam || read?.edit?.favorite_team || read?.traits.team_bias?.team || '';
  const needsCopy = needsText(read);

  return (
    <aside
      aria-hidden={!managerKey}
      aria-label={display ? `${display.team_name} scouting card` : undefined}
      className={[styles.panel, managerKey ? styles.open : ''].filter(Boolean).join(' ')}
    >
      {managerKey && read ? (
        <div className={styles.inner}>
          <header className={styles.header}>
            <div className={styles.avatar}>
              {display?.avatar_url ? <img alt="" src={display.avatar_url} /> : avatarInitials(display?.team_name ?? 'Team')}
            </div>
            <div className={styles.identity}>
              <p className={styles.eyebrow}>Scouting card</p>
              <h2>{display?.team_name ?? 'Team'}</h2>
              <p>
                {display?.name ?? 'Manager'} · <span className={styles.mono}>{recordFor(read)}</span>
                {teamTag ? <span className={styles.tag}>{teamTag}</span> : null}
              </p>
            </div>
            <button aria-label="Close scouting card" className={styles.close} onClick={onClose} type="button">
              ×
            </button>
          </header>

          {mode === 'read' ? (
            <>
              <section className={styles.section}>
                <p className={styles.label}>Tendencies</p>
                <div className={styles.meters}>
                  {SLIDERS.map(([key, label]) => {
                    const value = read.traits[key];
                    const evidence = evidenceByTrait.get(key);
                    const hasSignal = Boolean(evidence || read.edit?.overrides?.[key] != null);
                    const showValue = typeof value === 'number' && hasSignal;
                    return (
                      <div className={[styles.meter, showValue ? '' : styles.meterDim].filter(Boolean).join(' ')} key={key}>
                        <span>{label}</span>
                        <span className={styles.mono}>{showValue ? value : '—'}</span>
                        <span className={styles.track}>
                          {showValue ? <span className={styles.fill} style={{ width: `${value}%` }} /> : null}
                        </span>
                        {evidence ? <span className={styles.evidence}>{evidence}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              {resolvedTheirGuys.length > 0 ? (
                <section className={styles.section}>
                  <p className={styles.label}>Their guys</p>
                  <div className={styles.players}>
                    {resolvedTheirGuys.map((player) => (
                      <span className={styles.playerChip} key={player.id}>
                        <PlayerHeadshot player={player.model} />
                        {player.model.shortName ?? player.name}
                        {player.isLocked ? <span className={styles.lock}>Locked</span> : null}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {needsCopy ? (
                <section className={styles.section}>
                <p className={styles.label}>This week / Needs</p>
                <p className={styles.body}>{needsCopy}</p>
              </section>
              ) : null}

              {read.edit?.notes ? (
                <section className={styles.section}>
                  <p className={styles.label}>Notes</p>
                  <p className={styles.notes}>{read.edit.notes}</p>
                </section>
              ) : null}

              <footer className={styles.footer}>
                <button className={styles.textButton} onClick={() => setMode('edit')} type="button">
                  Edit read
                </button>
                {managerKey !== stored?.userId ? (
                  <a className={styles.dealLink} href={`/market?view=deals&manager=${encodeURIComponent(managerKey ?? '')}`}>
                    Open a deal →
                  </a>
                ) : null}
              </footer>
            </>
          ) : (
            <>
              <section className={styles.section}>
                <p className={styles.label}>Tendencies</p>
                {SLIDERS.map(([key, label]) => (
                  <label className={styles.rangeRow} key={key}>
                    <span>{label}</span>
                    <span className={styles.mono}>{overrides[key] ?? 50}</span>
                    <input
                      max={100}
                      min={0}
                      onChange={(event) => setOverrides({ ...overrides, [key]: Number(event.target.value) })}
                      style={{ '--fill': `${overrides[key] ?? 50}%` } as CSSProperties}
                      type="range"
                      value={overrides[key] ?? 50}
                    />
                  </label>
                ))}
              </section>

              <section className={styles.section}>
                <p className={styles.label}>Their guys</p>
                <input
                  className={styles.input}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Search players"
                  type="search"
                  value={playerSearch}
                />
                {playerResults.length > 0 ? (
                  <div className={styles.results}>
                    {playerResults.map(({ id, player }) => (
                      <button
                        key={id}
                        onClick={() => {
                          setUntouchables([...new Set([...untouchables, id])]);
                          setPlayerSearch('');
                        }}
                        type="button"
                      >
                        {player.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {resolvedTheirGuys.length > 0 ? (
                  <div className={styles.players}>
                    {resolvedTheirGuys.map((player) => (
                      player.isLocked ? (
                        <button
                          className={styles.playerChip}
                          key={player.id}
                          onClick={() => setUntouchables(untouchables.filter((x) => x !== player.id))}
                          type="button"
                        >
                          <PlayerHeadshot player={player.model} />
                          {player.model.shortName ?? player.name}
                          <span className={styles.lock}>Locked</span>
                          ×
                        </button>
                      ) : (
                        <span className={styles.playerChip} key={player.id}>
                          <PlayerHeadshot player={player.model} />
                          {player.model.shortName ?? player.name}
                        </span>
                      )
                    ))}
                  </div>
                ) : null}
              </section>

              <section className={styles.section}>
                <label className={styles.field}>
                  Favorite team
                  <select value={favoriteTeam} onChange={(event) => setFavoriteTeam(event.target.value)}>
                    <option value="">Unset</option>
                    {NFL_TEAMS.map((team) => <option key={team} value={team}>{team}</option>)}
                  </select>
                </label>
                <div className={styles.segmented}>
                  {[
                    ['clean', 'Takes clean offers'],
                    ['counters', 'Always counters'],
                    ['ghosts', 'Ghosts'],
                  ].map(([value, label]) => (
                    <button
                      className={negotiationStyle === value ? styles.segmentOn : ''}
                      key={value}
                      onClick={() => {
                        const next = value as 'clean' | 'counters' | 'ghosts';
                        setNegotiationStyle(negotiationStyle === next ? '' : next);
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className={styles.field}>
                  Notes
                  <textarea maxLength={280} onChange={(event) => setNotes(event.target.value)} value={notes} />
                  <span className={styles.counter}>{notes.length}/280</span>
                </label>
              </section>

              <footer className={styles.footer}>
                <button className={styles.primary} disabled={saving} onClick={() => void save()} type="button">
                  {saving ? 'Saving' : 'Save'}
                </button>
                <button className={styles.textButton} onClick={() => setMode('read')} type="button">
                  Cancel
                </button>
              </footer>
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
}
