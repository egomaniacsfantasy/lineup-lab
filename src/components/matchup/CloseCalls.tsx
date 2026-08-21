import { useEffect, useState } from 'react';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { fetchWeeklyRanges, type WeeklyRange } from '../../services/leagueApi';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import type { RosterSlot } from '../../types/matchup';
import './CloseCalls.css';

const SHOWN = 2;
/* Inside this many points the projection is not deciding it for you. */
const CONTESTED = 3.5;

/**
 * The slots where you actually have a choice.
 *
 * A first version ranked every starter by how far they could fall below their
 * projection, and it surfaced the three best players on the roster every time.
 * That is arithmetic, not insight: a 21-point projection has a wider absolute
 * range than an 8-point one, so sorting by range sorts by projection. Worse,
 * it was advice about players nobody is benching — one quarterback on the
 * roster means there is no decision to have an opinion about.
 *
 * A floor and a ceiling only earn their place where two players are close
 * enough that the projection does not settle it. So this shows contested slots
 * only, and shows both candidates, because that is the shape of the actual
 * question: not "is this player volatile" but "which of these two do I start".
 */
export function CloseCalls({ slots, week }: { slots: RosterSlot[]; week: number }) {
  const { stored, bootstrap } = useLeagueConnection();
  const [ranges, setRanges] = useState<Record<string, WeeklyRange> | null>(null);

  const contested = slots
    .map((slot) => {
      const best = [...slot.alternatives].sort((a, b) => b.projection - a.projection)[0];
      return best ? { slot, best, gap: slot.projection - best.projection } : null;
    })
    .filter((row): row is { slot: RosterSlot; best: RosterSlot['alternatives'][0]; gap: number } =>
      Boolean(row) && Math.abs(row!.gap) <= CONTESTED,
    )
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
    .slice(0, SHOWN);

  const ids = contested.flatMap((row) => [row.slot.starter.id, row.best.player.id]);
  const idKey = ids.join(',');

  useEffect(() => {
    if (ids.length === 0 || !week) return undefined;
    let cancelled = false;
    void fetchWeeklyRanges(week, ids, bootstrap?.league.scoringFamily)
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
  }, [week, idKey, stored?.leagueId, bootstrap?.league.scoringFamily]);

  if (contested.length === 0 || !ranges) return null;

  const usable = contested.filter(
    (row) => ranges[row.slot.starter.id] && ranges[row.best.player.id],
  );
  if (usable.length === 0) return null;

  /* One scale across every bar drawn, so a longer bar is a wider range rather
     than a differently drawn one. */
  const all = usable.flatMap((row) => [ranges[row.slot.starter.id], ranges[row.best.player.id]]);
  const low = Math.min(...all.map((r) => r.floor));
  const high = Math.max(...all.map((r) => r.ceiling));
  const span = Math.max(high - low, 1);
  const at = (value: number) => ((value - low) / span) * 100;

  const line = (player: { id: string; shortName: string }, projection: number, lead: boolean) => {
    const range = ranges[player.id];
    return (
      <div className={`calls__line${lead ? ' calls__line--lead' : ''}`} key={player.id}>
        <PlayerHeadshot className="calls__face" player={player as never} />
        <span className="calls__name">{player.shortName}</span>
        <span className="calls__bar">
          <span
            className="calls__range"
            style={{ left: `${at(range.floor)}%`, width: `${at(range.ceiling) - at(range.floor)}%` }}
          />
          <span className="calls__proj" style={{ left: `${at(range.mean ?? projection)}%` }} />
        </span>
        <span className="calls__nums">
          {range.floor.toFixed(0)}–{range.ceiling.toFixed(0)}
        </span>
      </div>
    );
  };

  return (
    <section className="matchup-page__module calls">
      {usable.map((row) => (
        <div className="calls__slot" key={row.slot.starter.id}>
          <div className="calls__head">
            <span className="calls__slot-label">{row.slot.slotLabel}</span>
            <span className="calls__gap">
              {Math.abs(row.gap) < 0.5
                ? 'level on projection'
                : `${Math.abs(row.gap).toFixed(1)} pts apart`}
            </span>
          </div>
          {line(row.slot.starter, row.slot.projection, true)}
          {line(row.best.player, row.best.projection, false)}
        </div>
      ))}
    </section>
  );
}
