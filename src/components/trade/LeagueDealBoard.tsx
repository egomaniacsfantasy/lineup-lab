import { PlayerHeadshot } from '../player/PlayerHeadshot';
import type { Player } from '../../types';
import './LeagueDealBoard.css';

export interface LeagueDealRow {
  key: string;
  partnerName: string;
  send: Player[];
  get: Player[];
  /** Already formatted, e.g. "+2.1%" */
  delta: string;
  up: boolean;
  /** Already formatted, e.g. "57%" */
  acceptance: string | null;
}

const SCAN_LINES = [
  'Pricing every roster in the league...',
  'Working the phones...',
  'Reading who needs what...',
  'Testing who says yes...',
  'Checking their depth charts...',
];

/**
 * The best deals anywhere in the league.
 *
 * This used to share a panel and a request with the manager picker, which put
 * a scan of every roster underneath a heading that said "tap a manager", and
 * then reported no deals because the results belonged to no manager in
 * particular. They are two questions. This one asks who in the league would
 * improve your team; the picker below asks what a specific manager would do.
 */
export function LeagueDealBoard({
  rows,
  loading,
  scanLine,
  onOpen,
  onShare,
}: {
  rows: LeagueDealRow[] | null;
  loading: boolean;
  scanLine: number;
  onOpen: (key: string) => void;
  onShare: (key: string) => void;
}) {
  /* Faces big enough to recognise, and full names.

     They were 28px headshots under "C. Lamb", which is the abbreviation you
     use when there is no room — and this row is most of a screen wide. */
  const side = (players: Player[], tone: 'send' | 'get') => (
    <span className={`ldb__side ldb__side--${tone}`}>
      {players.slice(0, 3).map((player) => (
        <span className="ldb__player" key={player.id}>
          <PlayerHeadshot className="ldb__face" player={player} />
          <span className="ldb__player-copy">
            <span className="ldb__player-name">{player.name}</span>
            <span className="ldb__player-meta">
              {player.position}
              {player.team ? ` · ${player.team}` : ''}
            </span>
          </span>
        </span>
      ))}
      {players.length > 3 ? (
        <span className="ldb__player-more">+{players.length - 3} more</span>
      ) : null}
    </span>
  );

  return (
    <section className="ldb">
      <div className="ldb__head">
        <div className="ldb__title">
          {/* Andre's wording. "Best deals in the league" claimed a
              superlative the list cannot support; "Deals worth a call" was my
              replacement and was worse. This one says what the list is and
              stops. */}
          <span className="ldb__label">Suggested trades</span>
          <span className="ldb__sub">Both sides gain. Fairest first.</span>
        </div>
        {rows && rows.length > 0 ? (
          <span className="ldb__count">{rows.length}</span>
        ) : null}
      </div>

      {loading ? (
        <>
          {[0, 1, 2].map((row) => (
            <span className="ldb__ghost" key={row}>
              <span className="ldb__ghost-side">
                <span className="ldb__ghost-face" />
                <span className="ldb__ghost-face" />
              </span>
              <span aria-hidden="true" className="ldb__ghost-arrow">⇄</span>
              <span className="ldb__ghost-side ldb__ghost-side--get">
                <span className="ldb__ghost-face" />
                <span className="ldb__ghost-face" />
              </span>
              <span className="ldb__ghost-meta" />
            </span>
          ))}
          <p className="ldb__pending">
            <span aria-hidden="true" className="ldb__pulse" />
            {SCAN_LINES[scanLine % SCAN_LINES.length]}
          </p>
        </>
      ) : rows && rows.length > 0 ? (
        <div className="ldb__rows">
          {/* Labelled once, at the top.

              The two figures on each row were a green percentage and a grey
              percentage sitting side by side with nothing saying which was
              which — one is what the trade does to your title odds, the other
              is how likely they are to accept, and they are not the same kind
              of number at all. */}
          <div className="ldb__columns" role="presentation">
            <span>You send</span>
            <span />
            <span>You get</span>
            <span>Your title</span>
            <span>They accept</span>
            <span />
          </div>
          {rows.map((row) => (
            <div className="ldb__row" key={row.key}>
              <button
                aria-label={`Open the deal with ${row.partnerName}`}
                className="ldb__open"
                onClick={() => onOpen(row.key)}
                type="button"
              >
                <span className="ldb__partner">{row.partnerName}</span>
                {side(row.send, 'send')}
                {/* One direction, not two. The old glyph was a two-headed
                    arrow, which is exactly as much as the row said about
                    which side you were giving up. */}
                <span aria-hidden="true" className="ldb__arrow">→</span>
                {side(row.get, 'get')}
                <span className={`ldb__delta ldb__delta--${row.up ? 'up' : 'down'}`}>
                  {row.delta}
                </span>
                <span className="ldb__accept">{row.acceptance ?? '—'}</span>
              </button>
              <button
                aria-label={`Share the deal with ${row.partnerName}`}
                className="ldb__share"
                onClick={() => onShare(row.key)}
                title="Share this trade"
                type="button"
              >
                ↗
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="ldb__empty">
          The book found nothing across the league worth proposing right now.
          Try a manager directly below.
        </p>
      )}
    </section>
  );
}
