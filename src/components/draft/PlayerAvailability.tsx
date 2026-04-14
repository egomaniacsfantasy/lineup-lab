import { useMemo, useState } from 'react';
import type { ConsensusRanking, LeagueStyle, Player } from '../../types';
import { formatAmericanOdds } from '../../utils/formatOdds';
import { LeagueStyleToggle } from './LeagueStyleToggle';
import { PlayerSearch } from './PlayerSearch';
import './PlayerAvailability.css';

interface PlayerAvailabilityProps {
  players: Player[];
  rankings: ConsensusRanking[];
  leagueStyle: LeagueStyle;
  onLeagueStyleChange: (value: LeagueStyle) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function probabilityToAmerican(probability: number) {
  const decimalProbability = probability / 100;

  if (decimalProbability >= 0.5) {
    return Math.round((-100 * decimalProbability) / (1 - decimalProbability));
  }

  return Math.round((100 * (1 - decimalProbability)) / decimalProbability);
}

function getAvailabilityProbability(
  player: Player,
  pickNumber: number,
  rankings: ConsensusRanking[],
  leagueStyle: LeagueStyle,
) {
  const rankEntry = rankings.find((ranking) => ranking.player.id === player.id);
  const rankingPosition = rankEntry?.rank ?? rankings.length + 2;
  const styleShift =
    leagueStyle === 'casual' ? 8 : leagueStyle === 'shark-tank' ? -8 : 0;

  return clamp(48 - (pickNumber - rankingPosition) * 7.5 + styleShift, 3, 92);
}

function getAvailabilityBlurb(player: Player, probability: number) {
  if (probability > 50) {
    return `${player.shortName} is likely available in this range. You can plan around it.`;
  }

  if (probability >= 25) {
    return `${player.shortName} is in coinflip territory here. Have a backup ready.`;
  }

  if (probability >= 10) {
    return `Unlikely but possible. ${player.shortName} will need a small slide to reach you.`;
  }

  return `Don't count on it. ${player.shortName} is usually gone well before this pick.`;
}

export function PlayerAvailability({
  players,
  rankings,
  leagueStyle,
  onLeagueStyleChange,
}: PlayerAvailabilityProps) {
  const [query, setQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [pickNumber, setPickNumber] = useState(7);

  const probability = useMemo(() => {
    if (!selectedPlayer) {
      return null;
    }

    return getAvailabilityProbability(
      selectedPlayer,
      pickNumber,
      rankings,
      leagueStyle,
    );
  }, [leagueStyle, pickNumber, rankings, selectedPlayer]);

  return (
    <section aria-labelledby="player-availability-title" className="player-availability">
      <div className="player-availability__header">
        <p className="player-availability__kicker">Player availability</p>
        <h2 className="player-availability__title" id="player-availability-title">
          How likely is your guy to make it back?
        </h2>
      </div>

      <div className="player-availability__controls">
        <PlayerSearch
          onQueryChange={(value) => {
            setQuery(value);
            if (value.length === 0) {
              setSelectedPlayer(null);
            }
          }}
          onSelect={(player) => {
            setSelectedPlayer(player);
            setQuery('');
          }}
          players={players}
          query={query}
          selectedPlayer={selectedPlayer}
        />

        <label className="player-availability__field">
          <span className="player-availability__label">Pick #</span>
          <input
            className="player-availability__input"
            max={12}
            min={1}
            onChange={(event) => setPickNumber(clamp(Number(event.target.value), 1, 12))}
            type="number"
            value={pickNumber}
          />
        </label>
      </div>

      <LeagueStyleToggle value={leagueStyle} onChange={onLeagueStyleChange} />

      {selectedPlayer && probability !== null ? (
        <article className="player-availability__result">
          <p className="player-availability__result-title">
            {selectedPlayer.shortName} available at pick {pickNumber}
          </p>
          <p className="player-availability__odds">
            {formatAmericanOdds(probabilityToAmerican(probability))}
          </p>
          <p className="player-availability__probability">{probability.toFixed(1)}%</p>
          <p className="player-availability__blurb">
            {getAvailabilityBlurb(selectedPlayer, probability)}
          </p>
        </article>
      ) : (
        <div className="player-availability__placeholder">
          Search for a player and set your pick to see live-looking availability odds.
        </div>
      )}
    </section>
  );
}
