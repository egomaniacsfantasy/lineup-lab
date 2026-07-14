import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { useScoutingCard } from '../../contexts/ScoutingCardContext';
import { fetchScoutingLeague, type ScoutingRead } from '../../services/leagueApi';
import styles from './ScoutingView.module.css';

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'OG';
}

function isVacantRead(read: ScoutingRead) {
  return read.manager_key.startsWith('vacant:') || read.manager.name === 'Unmanaged team';
}

export function ScoutingView() {
  const { stored, bootstrap } = useLeagueConnection();
  const { user } = useAuth();
  const { openScoutingCard } = useScoutingCard();
  const [reads, setReads] = useState<ScoutingRead[]>([]);

  useEffect(() => {
    if (!stored || !user) return;
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
  }, [stored, user]);

  // Opponents only (drop your own team), alphabetical.
  const opponents = useMemo(() => {
    if (!stored) return [];
    return [...reads]
      .filter((read) => read.manager_key !== stored.userId)
      .sort((a, b) => a.manager.team_name.localeCompare(b.manager.team_name));
  }, [reads, stored]);

  if (!stored || !bootstrap) {
    return <div className={styles.empty}>Syncing market reads.</div>;
  }

  return (
    <section className={styles.scouting} aria-label="Scouting reports">
      <div className={styles.grid}>
        {opponents.map((read) => {
          const isVacant = isVacantRead(read);
          return (
            <button
              className={[styles.card, isVacant ? styles.vacant : ''].filter(Boolean).join(' ')}
              key={read.manager_key}
              onClick={() => openScoutingCard(read.manager_key)}
              type="button"
            >
              <div className={styles.avatar}>
                {read.manager.avatar_url ? <img alt="" src={read.manager.avatar_url} /> : initials(read.manager.team_name)}
              </div>
              <div className={styles.copy}>
                <h3>{read.manager.team_name}</h3>
                <p>{read.manager.name} · <span>{read.manager.record ?? '0-0'}</span></p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
