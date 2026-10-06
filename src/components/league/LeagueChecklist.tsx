import type { ApiLeagueSummary } from '../../services/leagueApi';
import './LeagueChecklist.css';

/**
 * A list of leagues you tick.
 *
 * Shared by the connect wizard (first time through) and the manage sheet
 * (any time after), so choosing which Sleeper leagues appear looks and
 * behaves the same in both. A row is a real checkbox as far as assistive
 * tech is concerned; it is a button so the whole row is the target.
 */

const SCORING_LABELS: Record<ApiLeagueSummary['scoringFamily'], string> = {
  ppr: 'PPR',
  'half-ppr': 'Half PPR',
  standard: 'Standard',
};

interface LeagueChecklistProps {
  leagues: ApiLeagueSummary[];
  selected: ReadonlySet<string>;
  onToggle: (leagueId: string) => void;
  /** Leagues that cannot be toggled here, with the word that says why. */
  locked?: ReadonlySet<string>;
  lockedLabel?: string;
  disabled?: boolean;
}

export function LeagueChecklist({
  leagues,
  selected,
  onToggle,
  locked,
  lockedLabel = 'Added',
  disabled = false,
}: LeagueChecklistProps) {
  return (
    <div className="league-checklist" role="group">
      {leagues.map((league, index) => {
        const isLocked = locked?.has(league.id) ?? false;
        const isOn = isLocked || selected.has(league.id);
        return (
          <button
            aria-checked={isOn}
            aria-label={league.name}
            className={[
              'league-checklist__row',
              isOn ? 'league-checklist__row--on' : '',
              isLocked ? 'league-checklist__row--locked' : '',
            ].filter(Boolean).join(' ')}
            disabled={disabled || isLocked}
            key={`${league.id}:${index}`}
            onClick={() => onToggle(league.id)}
            role="checkbox"
            type="button"
          >
            <span aria-hidden="true" className="league-checklist__tick">
              {isOn ? (
                <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" viewBox="0 0 16 16">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              ) : null}
            </span>
            <span className="league-checklist__copy">
              <span className="league-checklist__name">{league.name}</span>
              <span className="league-checklist__meta">
                {[league.season, `${league.totalTeams} teams`, SCORING_LABELS[league.scoringFamily]]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {isLocked ? <span className="league-checklist__locked">{lockedLabel}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
