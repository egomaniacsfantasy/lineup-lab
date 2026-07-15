import { useEffect, useMemo, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { useScoutingCard } from '../../contexts/ScoutingCardContext';
import { loadTradeTraits } from '../../utils/tradeTraits';
import styles from './ScoutingView.module.css';

type ManagerTeam = NonNullable<ReturnType<typeof useLeagueConnection>['bootstrap']>['teams'][number];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'OG';
}

/**
 * One opponent, styled like the rest of the market cards. Tapping it opens the
 * scouting card where you set your two subjective reads (trade-friendliness and
 * relationship). Those save per league + roster and feed the acceptance odds in
 * Deals — no scraping, just your own read. `refreshKey` re-reads the saved
 * values after the card closes so the chips stay current.
 */
function TeamScoutCard({
  leagueId,
  team,
  refreshKey,
  onOpen,
}: {
  leagueId: string;
  team: ManagerTeam;
  refreshKey: string | null;
  onOpen: () => void;
}) {
  const [read, setRead] = useState(() => loadTradeTraits(leagueId, team.rosterId));
  useEffect(() => {
    setRead(loadTradeTraits(leagueId, team.rosterId));
  }, [leagueId, team.rosterId, refreshKey]);

  const vacant = !team.ownerId;

  return (
    <button
      className={styles.card}
      disabled={vacant}
      onClick={onOpen}
      type="button"
    >
      <div className={styles.file}>
        <header className={styles.header}>
          <div className={styles.avatar}>
            {team.avatarUrl ? <img alt="" src={team.avatarUrl} /> : initials(team.teamName)}
          </div>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>Your read</p>
            <h3>{team.teamName}</h3>
            <p>
              {team.ownerName} <span>{team.record.wins}-{team.record.losses}</span>
            </p>
          </div>
        </header>

        {vacant ? (
          <p className={styles.note}>Unmanaged team.</p>
        ) : (
          <div className={styles.numbers}>
            <div className={styles.numberRow}>
              <span className={styles.label}>Trade-friendliness</span>
              <span>{read.friendliness}/10</span>
            </div>
            <div className={styles.numberRow}>
              <span className={styles.label}>Relationship</span>
              <span>{read.relationship}/10</span>
            </div>
            <p className={styles.footerSub}>Tap to edit · feeds acceptance in Deals</p>
          </div>
        )}
      </div>
    </button>
  );
}

export function ScoutingView() {
  const { stored, bootstrap } = useLeagueConnection();
  const { openScoutingCard, activeManagerKey } = useScoutingCard();

  const teams = useMemo(
    () => (bootstrap ? bootstrap.teams.filter((team) => !team.isUser) : []),
    [bootstrap],
  );

  if (!stored || !bootstrap) {
    return <div className={styles.empty}>Syncing league.</div>;
  }

  return (
    <section className={styles.scouting} aria-label="Scouting">
      <header className={styles.topline}>
        <div>
          <p className={styles.pageEyebrow}>Scouting</p>
          <h2 className={styles.pageTitle}>Your reads</h2>
          <p className={styles.pageBody}>
            Tap a manager to set two subjective reads: trade-friendliness and relationship.
            They feed the acceptance odds on every deal you build with them.
          </p>
        </div>
      </header>

      <div className={styles.grid}>
        {teams.map((team) => (
          <TeamScoutCard
            key={`${team.rosterId}:${team.ownerId ?? 'vacant'}`}
            leagueId={stored.leagueId}
            onOpen={() => team.ownerId && openScoutingCard(team.ownerId)}
            refreshKey={activeManagerKey}
            team={team}
          />
        ))}
      </div>
    </section>
  );
}
