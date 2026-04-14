import type { LeagueStyle } from '../../types';
import './LeagueStyleToggle.css';

const OPTIONS: { label: string; value: LeagueStyle }[] = [
  { label: 'Casual', value: 'casual' },
  { label: 'Competitive', value: 'competitive' },
  { label: 'Shark Tank', value: 'shark-tank' },
];

interface LeagueStyleToggleProps {
  value: LeagueStyle;
  onChange: (value: LeagueStyle) => void;
}

export function LeagueStyleToggle({
  value,
  onChange,
}: LeagueStyleToggleProps) {
  return (
    <div className="league-style-toggle" role="group" aria-label="League style">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          className={[
            'league-style-toggle__option',
            value === option.value ? 'league-style-toggle__option--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
