import { useEffect, useState } from 'react';
import {
  fetchPlayoffSettings,
  savePlayoffSettings,
  type PlayoffSettings as PlayoffSettingsData,
} from '../../services/leagueApi';
import './PlayoffSettings.css';

/**
 * Playoff-structure controls: shows what we detected and lets the user correct
 * the two things we can't always detect — division-winner seeding priority and
 * bracket reseeding — so the sim seeds the way their real league does.
 */
export function PlayoffSettings({
  leagueId,
  onChange,
}: {
  leagueId: string;
  onChange?: () => void;
}) {
  const [data, setData] = useState<PlayoffSettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPlayoffSettings(leagueId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [leagueId]);

  const patch = async (p: { divisionWinnerPriority?: boolean; playoffReseed?: boolean }) => {
    setSaving(true);
    try {
      await savePlayoffSettings(leagueId, p);
      setData(await fetchPlayoffSettings(leagueId));
      onChange?.();
    } finally {
      setSaving(false);
    }
  };

  if (!data) return null;

  return (
    <section className="po-settings" aria-label="Playoff structure">
      <div className="po-settings__head">
        <h3 className="po-settings__title">Playoff structure</h3>
        <span className="po-settings__sub">
          How the sim seeds the bracket. Correct these if they don&apos;t match your league.
        </span>
      </div>

      <div className="po-settings__rows">
        <div className="po-settings__row">
          <span className="po-settings__label">Divisions</span>
          <span className="po-settings__value">{data.hasDivisions ? data.divisions : 'None'}</span>
        </div>

        {data.hasDivisions ? (
          <label className="po-settings__row po-settings__row--toggle">
            <span className="po-settings__label">Division winners seeded first</span>
            <input
              type="checkbox"
              checked={data.divisionWinnerPriority ?? true}
              disabled={saving}
              onChange={(event) => void patch({ divisionWinnerPriority: event.target.checked })}
            />
          </label>
        ) : null}

        <label className="po-settings__row po-settings__row--toggle">
          <span className="po-settings__label">
            Reseed bracket each round
            {data.detected.playoffReseed != null ? (
              <span className="po-settings__hint"> (detected: {data.detected.playoffReseed ? 'yes' : 'no'})</span>
            ) : null}
          </span>
          <input
            type="checkbox"
            checked={data.playoffReseed}
            disabled={saving}
            onChange={(event) => void patch({ playoffReseed: event.target.checked })}
          />
        </label>
      </div>

      <p className="po-settings__note">Changes reprice the league on its next update.</p>
    </section>
  );
}
