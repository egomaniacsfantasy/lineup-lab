import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchScoutingLeague, type ScoutingRead } from '../../services/leagueApi';
import { loadTradeTraits, saveTradeTraits, NEUTRAL_READ } from '../../utils/tradeTraits';
import styles from './ScoutingCard.module.css';

// The two subjective, user-set reads on a manager (0..10). These are the SAME
// values the Deals builder's "Your read" edits (shared localStorage, keyed by
// league + roster id), so editing here changes the trade-acceptance odds there.
const READS = [
  ['friendliness', 'Trade-friendliness', '0 = stubborn hoarder · 10 = wheeler-dealer'],
  ['relationship', 'Relationship', '0 = despises you · 10 = great terms'],
] as const;

function recordFor(read: ScoutingRead | null) {
  return read?.manager?.record ?? '0-0';
}

function avatarInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'OG';
}

export function ScoutingCard({
  managerKey,
  onClose,
}: {
  managerKey: string | null;
  onClose: () => void;
}) {
  const { stored } = useLeagueConnection();
  const { user } = useAuth();
  const [reads, setReads] = useState<ScoutingRead[]>([]);
  const [values, setValues] = useState(NEUTRAL_READ);

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
  const rosterId = read?.manager.roster_id ?? null;

  // Load this team's saved read once we know its roster id. Keyed on rosterId so
  // reopening/editing the same team doesn't clobber in-progress changes.
  useEffect(() => {
    if (!stored) return;
    setValues(loadTradeTraits(stored.leagueId, rosterId));
  }, [stored, rosterId]);

  useEffect(() => {
    if (!managerKey) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [managerKey, onClose]);

  const update = (key: 'friendliness' | 'relationship', value: number) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (stored) saveTradeTraits(stored.leagueId, rosterId, next);
  };

  const display = read?.manager;
  const dealHref =
    stored && managerKey && rosterId != null
      ? `/market?view=deals&leagueId=${encodeURIComponent(stored.leagueId)}&managerRosterId=${rosterId}&manager=${encodeURIComponent(managerKey)}`
      : stored && managerKey
        ? `/market?view=deals&leagueId=${encodeURIComponent(stored.leagueId)}&manager=${encodeURIComponent(managerKey)}`
        : '/market?view=deals';

  return (
    <aside
      aria-hidden={!managerKey}
      aria-label={display ? `${display.team_name} read` : undefined}
      className={[styles.panel, managerKey ? styles.open : ''].filter(Boolean).join(' ')}
    >
      {managerKey && read ? (
        <div className={styles.inner}>
          <header className={styles.header}>
            <div className={styles.avatar}>
              {display?.avatar_url ? <img alt="" src={display.avatar_url} /> : avatarInitials(display?.team_name ?? 'Team')}
            </div>
            <div className={styles.identity}>
              <p className={styles.eyebrow}>Your read</p>
              <h2>{display?.team_name ?? 'Team'}</h2>
              <p>
                {display?.name ?? 'Manager'} · <span className={styles.mono}>{recordFor(read)}</span>
              </p>
            </div>
            <button aria-label="Close read" className={styles.close} onClick={onClose} type="button">
              ×
            </button>
          </header>

          <section className={styles.section}>
            {READS.map(([key, label, hint]) => (
              <label className={styles.rangeRow} key={key}>
                <span>{label}</span>
                <span className={styles.mono}>{values[key]}</span>
                <input
                  max={10}
                  min={0}
                  step={1}
                  onChange={(event) => update(key, Number(event.target.value))}
                  style={{ '--fill': `${values[key] * 10}%` } as CSSProperties}
                  type="range"
                  value={values[key]}
                />
                <span className={styles.evidence}>{hint}</span>
              </label>
            ))}
            <p className={styles.body}>
              These set how likely {display?.name ?? 'this manager'} is to accept a trade. Synced with the Deals
              builder, saved for this team.
            </p>
          </section>

          <footer className={styles.footer}>
            <span className={styles.mono} style={{ color: 'var(--text-muted)' }}>Saved automatically</span>
            <Link className={styles.dealLink} to={dealHref}>
              Open a deal →
            </Link>
          </footer>
        </div>
      ) : null}
    </aside>
  );
}
