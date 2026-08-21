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
  const side = (players: Player[], tone: 'send' | 'get') => (
    <span className={`ldb__side ldb__side--${tone}`}>
      <span className="ldb__faces">
        {players.slice(0, 3).map((player) => (
          <PlayerHeadshot className="ldb__face" key={player.id} player={player} />
        ))}
      </span>
      <span className="ldb__names">
        {players.map((player) => player.shortName).join(', ')}
      </span>
    </span>
  );

  return (
    <section className="ldb">
      <div className="ldb__head">
        <span className="ldb__label">Best deals in the league</span>
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
          {rows.map((row) => (
            <div className="ldb__row" key={row.key}>
              <button className="ldb__open" onClick={() => onOpen(row.key)} type="button">
                {side(row.send, 'send')}
                <span aria-hidden="true" className="ldb__arrow">⇄</span>
                {side(row.get, 'get')}
                <span className="ldb__read">
                  <span className="ldb__partner">{row.partnerName}</span>
                  <span className="ldb__numbers">
                    <span className={`ldb__delta ldb__delta--${row.up ? 'up' : 'down'}`}>
                      {row.delta}
                    </span>
                    {row.acceptance ? (
                      <span className="ldb__accept">{row.acceptance}</span>
                    ) : null}
                  </span>
                </span>
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
