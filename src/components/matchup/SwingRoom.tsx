import { useEffect, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchWeeklyRanges, type WeeklyRange } from '../../services/leagueApi';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import type { Player } from '../../types';
import './SwingRoom.css';

const SHOWN = 3;

/**
 * How much room your week has left in it, and which end you want.
 *
 * Franco projects a floor and a ceiling for every player for every week, which
 * almost nothing else in fantasy does, and the app has never shown either.
 *
 * The range on its own is trivia. What makes it a decision is the line: a
 * favourite is protecting a floor, so a boom-or-bust starter is the liability,
 * and an underdog needs a ceiling, so the safe one is. Same roster, opposite
 * reading, and the moneyline at the top of the page already says which you
 * are. The widget reads it and sorts accordingly.
 *
 * Nothing is computed here. The floor and the ceiling are served exactly as
 * the projection set produced them; this sorts and draws them.
 */
export function SwingRoom({
  starters,
  week,
  favoured,
}: {
  starters: Player[];
  week: number;
  favoured: boolean;
}) {
  const { stored, bootstrap } = useLeagueConnection();
  const [ranges, setRanges] = useState<Record<string, WeeklyRange> | null>(null);

  useEffect(() => {
    if (!starters.length || !week) return undefined;
    let cancelled = false;
    void fetchWeeklyRanges(
      week,
      starters.map((p) => p.id),
      bootstrap?.league.scoringFamily,
    )
      .then((response) => {
        if (!cancelled) setRanges(response.available ? response.ranges : {});
      })
      .catch(() => {
        if (!cancelled) setRanges({});
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, stored?.leagueId, starters.map((p) => p.id).join(','), bootstrap?.league.scoringFamily]);

  if (!ranges) return null;

  const rows = starters
    .map((player) => ({ player, range: ranges[player.id] }))
    .filter((row): row is { player: Player; range: WeeklyRange } => Boolean(row.range))
    /* Favoured: the biggest downside is the threat, so sort by how far a
       player can fall below their projection. Underdog: the biggest upside is
       the hope, so sort by how far they can climb above it. */
    .sort((a, b) => {
      const drop = (r: WeeklyRange) => (r.mean ?? r.floor) - r.floor;
      const climb = (r: WeeklyRange) => r.ceiling - (r.mean ?? r.ceiling);
      return favoured
        ? drop(b.range) - drop(a.range)
        : climb(b.range) - climb(a.range);
    })
    .slice(0, SHOWN);

  if (rows.length === 0) return null;

  const low = Math.min(...rows.map((r) => r.range.floor));
  const high = Math.max(...rows.map((r) => r.range.ceiling));
  const span = Math.max(high - low, 1);
  const at = (value: number) => ((value - low) / span) * 100;

  return (
    <section className="matchup-page__module swing">
      <p className="swing__title">
        {favoured ? 'You are favoured. Protect the floor.' : 'You are the underdog. You need a ceiling.'}
        <span className="swing__note">
          {favoured
            ? 'These three can fall furthest below their projection.'
            : 'These three can climb furthest above their projection.'}
        </span>
      </p>

      <div className="swing__rows">
        {rows.map(({ player, range }) => {
          const mean = range.mean ?? (range.floor + range.ceiling) / 2;
          return (
            <div className="swing__row" key={player.id}>
              <PlayerHeadshot className="swing__face" player={player} />
              <span className="swing__copy">
                <span className="swing__name">{player.shortName}</span>
                <span className="swing__bar">
                  <span
                    className="swing__range"
                    style={{ left: `${at(range.floor)}%`, width: `${at(range.ceiling) - at(range.floor)}%` }}
                  />
                  <span className="swing__mean" style={{ left: `${at(mean)}%` }} />
                </span>
              </span>
              <span className="swing__numbers">
                <span className="swing__floor">{range.floor.toFixed(0)}</span>
                <span className="swing__dash">–</span>
                <span className="swing__ceiling">{range.ceiling.toFixed(0)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
