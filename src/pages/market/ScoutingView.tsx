import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { useScoutingAffectsAcceptance, writeScoutingAffectsAcceptance } from '../../hooks/useLabsFlags';
import {
  compileManagerFile,
  formatCompiledAt,
  type ManagerFile,
} from '../../services/managerFiles';
import { SimulationLoader } from '../../components/ui/SimulationLoader';
import styles from './ScoutingView.module.css';

function fileMessages() {
  return ['Pulling their file...', 'Checking the tape...', 'Calling around the league...'];
}

function formatPct(value: number | null) {
  return value == null ? 'n/a' : `${value}%`;
}

function formatValue(value: number | null, digits = 1) {
  if (value == null) return 'n/a';
  return value.toFixed(digits);
}

function dossierRows(file: ManagerFile) {
  return [
    [`Trades/season (weighted) · ${file.scopes.lineage}`, file.numbers.tradesPerSeason == null ? 'n/a' : formatValue(file.numbers.tradesPerSeason)],
    [`Initiation · ${file.scopes.lineage}`, formatPct(file.numbers.tradeInitiationRate)],
    [`Waiver adds/week · ${file.scopes.lineage}`, file.numbers.waiverAddsPerWeek == null ? 'n/a' : formatValue(file.numbers.waiverAddsPerWeek, 2)],
    [`FAAB used · ${file.scopes.lineage}`, file.numbers.faabUsed == null ? 'n/a' : `$${Math.round(file.numbers.faabUsed)}`],
    [`Career record · ${file.scopes.career}`, file.numbers.careerRecord ?? 'n/a'],
    [`Playoff rate · ${file.scopes.career}`, formatPct(file.numbers.playoffRate)],
    [`Titles · ${file.scopes.career}`, file.numbers.titles == null ? 'n/a' : String(file.numbers.titles)],
    [`Vs you · ${file.scopes.headToHead}`, file.numbers.headToHeadRecord ?? 'n/a'],
    [`Bench left/week · ${file.scopes.bench}`, file.numbers.benchPointsLeftPerWeek == null ? 'n/a' : formatValue(file.numbers.benchPointsLeftPerWeek)],
  ];
}

function ScoutingToggle({ leagueId, checked }: { leagueId: string; checked: boolean }) {
  return (
    <label className={styles.toggle}>
      <span>Scouting affects acceptance odds</span>
      <button
        aria-pressed={checked}
        className={[styles.toggleTrack, checked ? styles.toggleTrackOn : ''].filter(Boolean).join(' ')}
        onClick={() => writeScoutingAffectsAcceptance(leagueId, !checked)}
        type="button"
      >
        <span className={styles.toggleThumb} />
      </button>
    </label>
  );
}

function ManagerProfileCard({
  leagueId,
  provider,
  managerTeam,
  viewerUserId,
  currentWeek,
}: {
  leagueId: string;
  provider: 'sleeper' | 'espn';
  managerTeam: NonNullable<ReturnType<typeof useLeagueConnection>['bootstrap']>['teams'][number];
  viewerUserId: string;
  currentWeek: number;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(provider === 'espn' || !managerTeam.ownerId);
  const [file, setFile] = useState<ManagerFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  useEffect(() => {
    if (visible) return;
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: '160px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const loadFile = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const next = await compileManagerFile({
          provider,
          leagueId,
          managerTeam,
          viewerUserId,
          currentWeek,
          force,
        });
        setFile(next);
        setActiveChip((current) =>
          next.chips.some((chip) => chip.key === current) ? current : next.chips[0]?.key ?? null,
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not compile this file.');
      } finally {
        setLoading(false);
      }
    },
    [currentWeek, leagueId, managerTeam, provider, viewerUserId],
  );

  useEffect(() => {
    if (!visible || file || loading || error) return;
    void loadFile();
  }, [error, file, loadFile, loading, visible]);

  if (file?.status === 'unmanaged') {
    return (
      <article className={[styles.card, styles.unmanaged].join(' ')} ref={cardRef}>
        <p className={styles.unmanagedLine}>
          <span>{managerTeam.teamName}</span>
          <span>No file. Unmanaged team.</span>
        </p>
      </article>
    );
  }

  const chip = file?.chips.find((item) => item.key === activeChip) ?? null;

  return (
    <article className={styles.card} ref={cardRef}>
      {!file || loading ? (
        <div className={styles.loaderCard}>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>The file</p>
            <h3>{managerTeam.teamName}</h3>
            <p>
              {managerTeam.ownerName} <span>{managerTeam.record.wins}-{managerTeam.record.losses}</span>
            </p>
          </div>
          <SimulationLoader label="Compiling manager file" messages={fileMessages()} size="compact" variant="scan" />
        </div>
      ) : null}

      {error && !loading ? (
        <div className={styles.errorCard}>
          <p>Could not compile this file right now.</p>
          <button onClick={() => void loadFile(true)} type="button">Retry</button>
        </div>
      ) : null}

      {file ? (
        <div className={styles.file}>
          <header className={styles.header}>
            <div className={styles.avatar}>
              {file.avatarUrl ? <img alt="" src={file.avatarUrl} /> : file.teamName.slice(0, 2).toUpperCase()}
            </div>
            <div className={styles.identity}>
              <div className={styles.identityTop}>
                <p className={styles.eyebrow}>The file</p>
                {file.fileTag ? <span className={styles.fileTag}>{file.fileTag}</span> : null}
              </div>
              <h3>{file.teamName}</h3>
              <p>
                {file.managerName} <span>{file.record}</span>
              </p>
              <p className={styles.tenure}>{file.tenureLine}</p>
            </div>
          </header>

          {file.chips.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.chips}>
                {file.chips.map((item) => (
                  <button
                    className={[styles.chip, item.key === activeChip ? styles.chipActive : ''].filter(Boolean).join(' ')}
                    key={item.key}
                    onClick={() => setActiveChip(item.key === activeChip ? null : item.key)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {chip ? (
                <div className={styles.receipt}>
                  <p>{chip.receipt}</p>
                  <p>{chip.threshold}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.numbers}>
              {dossierRows(file).map(([label, value]) => (
                <div className={styles.numberRow} key={label}>
                  <span>{label}</span>
                  <code>{value}</code>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <p className={styles.label}>The book&apos;s read</p>
            <p className={styles.bookRead}>{file.bookRead}</p>
          </section>

          {file.notes.length > 0 ? (
            <section className={styles.section}>
              {file.notes.map((note) => (
                <p className={styles.note} key={note}>{note}</p>
              ))}
            </section>
          ) : null}

          <footer className={styles.footer}>
            <div>
              <p className={styles.footerLine}>
                Scouted read defaults to {file.readDefaults.friendliness}/{file.readDefaults.relationship}
              </p>
              <p className={styles.footerSub}>Compiled {formatCompiledAt(file.compiledAt)}</p>
            </div>
            <button className={styles.refresh} onClick={() => void loadFile(true)} type="button">
              Refresh
            </button>
          </footer>
        </div>
      ) : null}
    </article>
  );
}

export function ScoutingView() {
  const { stored, bootstrap } = useLeagueConnection();
  const scoutingAffectsAcceptance = useScoutingAffectsAcceptance(stored?.leagueId);

  const teams = useMemo(
    () => (bootstrap ? bootstrap.teams.filter((team) => !team.isUser) : []),
    [bootstrap],
  );

  if (!stored || !bootstrap) {
    return <div className={styles.empty}>Syncing market reads.</div>;
  }

  return (
    <section className={styles.scouting} aria-label="Scouting files">
      <header className={styles.topline}>
        <div>
          <p className={styles.pageEyebrow}>Scouting</p>
          <h2 className={styles.pageTitle}>Manager files</h2>
          <p className={styles.pageBody}>
            Public Sleeper history compiled one manager at a time. Thin files stay thin. Vacant rosters stay vacant.
          </p>
        </div>
        <ScoutingToggle checked={scoutingAffectsAcceptance} leagueId={stored.leagueId} />
      </header>

      <div className={styles.grid}>
        {teams.map((team) => (
          <ManagerProfileCard
            currentWeek={bootstrap.week}
            key={`${team.rosterId}:${team.ownerId ?? 'vacant'}`}
            leagueId={stored.leagueId}
            managerTeam={team}
            provider={stored.provider}
            viewerUserId={stored.userId}
          />
        ))}
      </div>
    </section>
  );
}
