import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { useScoutingCard } from '../../contexts/ScoutingCardContext';
import {
  fetchScoutingLeague,
  fetchScoutingSuperlatives,
  type ScoutingRead,
  type ScoutingSuperlative,
} from '../../services/leagueApi';
import { scoutingTagCandidates } from '../../components/scouting/scoutingTags';
import styles from './ScoutingView.module.css';

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'OG';
}

function revealKey(leagueId: string) {
  return `og.scouting.reveal.${leagueId}`;
}

function isVacantRead(read: ScoutingRead) {
  return read.manager_key.startsWith('vacant:') || read.manager.name === 'Unmanaged team';
}

function superlativeLabel(item: ScoutingSuperlative, reads: ScoutingRead[]) {
  const manager = reads.find((read) => read.manager_key === item.manager_key)?.manager;
  const name = manager?.name ?? manager?.team_name ?? 'Manager';
  const tag = item.key === 'stingiest'
    ? 'Stingiest'
    : item.key === 'biggest_homer'
      ? 'Biggest homer'
      : item.key === 'waiver_shark'
        ? 'Waiver shark'
        : 'Fastest trigger';
  const team = item.key === 'biggest_homer'
    ? reads.find((read) => read.manager_key === item.manager_key)?.traits.team_bias?.team
    : null;
  return `${tag}: ${name}${team ? ` (${team})` : ''}`;
}

export function ScoutingView() {
  const { stored, bootstrap } = useLeagueConnection();
  const { user } = useAuth();
  const { openScoutingCard } = useScoutingCard();
  const [reads, setReads] = useState<ScoutingRead[]>([]);
  const [superlatives, setSuperlatives] = useState<ScoutingSuperlative[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());

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
    fetchScoutingSuperlatives(stored.leagueId)
      .then((payload) => {
        if (!cancelled) setSuperlatives(payload.superlatives ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuperlatives([]);
      });
    return () => {
      cancelled = true;
    };
  }, [stored, user]);

  const sortedReads = useMemo(() => {
    if (!stored) return reads;
    return [...reads].sort((a, b) => {
      const aUser = a.manager_key === stored.userId ? 1 : 0;
      const bUser = b.manager_key === stored.userId ? 1 : 0;
      return aUser - bUser || a.manager.team_name.localeCompare(b.manager.team_name);
    });
  }, [reads, stored]);

  const dismissed = stored
    ? dismissedKeys.has(stored.leagueId) ||
      window.localStorage.getItem(revealKey(stored.leagueId)) === '1'
    : false;
  const eligibleSuperlatives = useMemo(() => {
    if (!stored) return [];
    const readByManager = new Map(reads.map((read) => [read.manager_key, read]));
    return superlatives.filter((item) => {
      if (item.manager_key === stored.userId) return false;
      const read = readByManager.get(item.manager_key);
      return read && !isVacantRead(read);
    });
  }, [reads, stored, superlatives]);
  const revealManagers = new Set(eligibleSuperlatives.map((item) => item.manager_key));
  const showReveal = Boolean(stored && !dismissed && eligibleSuperlatives.length >= 2 && revealManagers.size >= 2);

  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    const strongest = new Map<string, number>();
    const managedReads = sortedReads.filter((read) => !isVacantRead(read));
    for (const read of managedReads) {
      for (const tag of scoutingTagCandidates(read)) {
        counts.set(tag.label, (counts.get(tag.label) ?? 0) + 1);
        strongest.set(tag.label, Math.max(strongest.get(tag.label) ?? 0, tag.score));
      }
    }
    return { counts, strongest, managedCount: managedReads.length };
  }, [sortedReads]);

  if (!stored || !bootstrap) {
    return <div className={styles.empty}>Syncing market reads.</div>;
  }

  return (
    <section className={styles.scouting} aria-label="Scouting reports">
      {showReveal ? (
        <article className={styles.reveal} data-share-surface="league-read">
          <h2>The book has read your league.</h2>
          <div className={styles.superlatives}>
            {eligibleSuperlatives.map((item) => (
              <p key={item.key}>
                <span>{superlativeLabel(item, reads).split(':')[0]}:</span>{' '}
                <code>{superlativeLabel(item, reads).split(':').slice(1).join(':').trim()}</code>
              </p>
            ))}
          </div>
          <button
            className={styles.revealDismiss}
            onClick={() => {
              window.localStorage.setItem(revealKey(stored.leagueId), '1');
              setDismissedKeys((current) => new Set([...current, stored.leagueId]));
            }}
            type="button"
          >
            Enter the market
          </button>
        </article>
      ) : null}

      <div className={styles.grid}>
        {sortedReads.map((read) => {
          const isUser = read.manager_key === stored.userId;
          const isVacant = isVacantRead(read);
          const tags = scoutingTagCandidates(read)
            .filter((tag) => {
              const count = tagStats.counts.get(tag.label) ?? 0;
              if (tagStats.managedCount > 1 && count >= tagStats.managedCount) {
                return tag.score === tagStats.strongest.get(tag.label);
              }
              return true;
            })
            .slice(0, 3)
            .map((tag) => tag.label);
          return (
            <button
              className={[styles.card, isUser ? styles.self : '', isVacant ? styles.vacant : '']
                .filter(Boolean)
                .join(' ')}
              disabled={isVacant}
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
                {tags.length > 0 ? (
                  <div className={styles.tags}>
                    {tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
