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
 * The trades the book would make, one card each.
 *
 * This was a table: a column-header row, four sizes of grey micro-copy, a
 * position-and-team line under every name, and two right-aligned numeric
 * columns. Every part of it was legible and the whole thing read like a
 * spreadsheet — which is the wrong register for the one surface in the app
 * whose job is to make you want to send someone a message.
 *
 * So: cards, three zones each. Who it is with, the players at a size where
 * the face does the identifying, and what it does for you. Labels are words
 * next to the thing they label rather than headings over a column, which is
 * what lets the header row go.
 */
export function LeagueDealBoard({
  rows,
  loading,
  scanLine,
  refreshing = false,
  onOpen,
  onShare,
  onRefresh,
}: {
  rows: LeagueDealRow[] | null;
  loading: boolean;
  scanLine: number;
  refreshing?: boolean;
  onOpen: (key: string) => void;
  onShare: (key: string) => void;
  onRefresh?: (() => void) | null;
}) {
  const side = (players: Player[], tone: 'send' | 'get') => (
    <span className={`ldb__side ldb__side--${tone}`}>
      <span className="ldb__side-label">{tone === 'send' ? 'You send' : 'You get'}</span>
      {players.map((player) => (
        <span className="ldb__player" key={player.id}>
          <PlayerHeadshot className="ldb__face" player={player} />
          <span className="ldb__player-name">{player.name}</span>
        </span>
      ))}
    </span>
  );

  return (
    <section className="ldb">
      <div className="ldb__head">
        <span className="ldb__label">Suggested trades</span>
        <div className="ldb__head-actions">
          {rows && rows.length > 0 ? <span className="ldb__count">{rows.length}</span> : null}
          {onRefresh ? (
            <button
              aria-label="Show different suggested trades"
              className="ldb__refresh"
              disabled={loading || refreshing}
              onClick={onRefresh}
              type="button"
            >
              <span aria-hidden="true" className={refreshing ? 'ldb__refresh-spin' : ''}>
                ↻
              </span>
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          ) : null}
        </div>
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
              <button
                aria-label={`Open the trade with ${row.partnerName}`}
                className="ldb__open"
                onClick={() => onOpen(row.key)}
                type="button"
              >
                <span className="ldb__with">
                  <span className="ldb__with-label">With</span>
                  <span className="ldb__with-name">{row.partnerName}</span>
                  {/* "3% likely" reads as a verdict on the trade; "3% to
                      accept" names the thing being measured, which is the
                      other manager. */}
                  {row.acceptance ? (
                    <span className="ldb__accept">{row.acceptance} to accept</span>
                  ) : null}
                </span>

                <span className="ldb__swap">
                  {side(row.send, 'send')}
                  <span aria-hidden="true" className="ldb__arrow">→</span>
                  {side(row.get, 'get')}
                </span>

                <span className="ldb__verdict">
                  <span className="ldb__verdict-label">Your title odds</span>
                  <span className={`ldb__delta ldb__delta--${row.up ? 'up' : 'down'}`}>
                    {row.delta}
                  </span>
                </span>
              </button>

              <button
                aria-label={`Share the trade with ${row.partnerName}`}
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
