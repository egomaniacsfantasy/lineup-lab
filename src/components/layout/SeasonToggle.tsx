import { useSeasonMode } from '../../hooks/useSeasonMode';
import './SeasonToggle.css';

export function SeasonToggle() {
  const { mode, toggleMode } = useSeasonMode();

  return (
    <div
      aria-label="Season mode"
      className="season-toggle"
      role="group"
    >
      <button
        aria-pressed={mode === 'preseason'}
        className={[
          'season-toggle__button',
          mode === 'preseason' ? 'season-toggle__button--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (mode !== 'preseason') {
            toggleMode();
          }
        }}
        type="button"
      >
        PRE
      </button>
      <button
        aria-pressed={mode === 'inseason'}
        className={[
          'season-toggle__button',
          'season-toggle__button--live',
          mode === 'inseason' ? 'season-toggle__button--active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (mode !== 'inseason') {
            toggleMode();
          }
        }}
        type="button"
      >
        <span className="season-toggle__live-dot" aria-hidden="true" />
        LIVE
      </button>
    </div>
  );
}
