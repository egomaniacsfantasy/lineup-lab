import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NO_VALUE, formatAmericanOdds } from '../../utils/formatOdds';
import { spreadLabel, type BoardTeam } from '../../utils/boardSides';
import { pairLineups, type LineupSlotEntry } from '../../utils/matchupLineups.ts';
import { managerLine } from '../../utils/managerLine';
import { playerShortName } from '../../utils/playerNames';
import { useOddsFormat } from '../../contexts/OddsFormatContext';
import { PlayerHeadshot } from '../player/PlayerHeadshot';
import { TeamCrest } from '../matchup/TeamCrest';
import './MatchupDetail.css';
/* The Hub's stylesheet, borrowed on purpose.
 *
 * This dialog is meant to BE the Hub's head-to-head card and lineup board,
 * not a second pair that resemble them, so it renders the same class names
 * and lets one stylesheet dress both. Importing it here says so out loud and
 * survives anyone later code-splitting the pages, which would otherwise leave
 * this screen unstyled on the League tab and nowhere else. */
import '../../pages/MatchupPage.css';

interface MatchupDetailProps {
  left: BoardTeam;
  right: BoardTeam;
  /** The game total, which is one number for the game rather than per side. */
  total?: number;
  leftStarters?: readonly LineupSlotEntry[];
  rightStarters?: readonly LineupSlotEntry[];
  week: number;
  onClose: () => void;
}

function pointsText(value: number | null | undefined) {
  return value == null ? NO_VALUE : value.toFixed(1);
}

function metaFor(entry: LineupSlotEntry) {
  return [entry.position, entry.team].filter(Boolean).join(' · ');
}

/**
 * One game, opened over the board.
 *
 * A dialog rather than a panel under the cards: the board is a grid two and
 * three across, so an expanding block below it pushed the rest of the week
 * down the page and put the thing you had just pressed off screen. A game you
 * open is a thing you look at and then close.
 *
 * Everything inside it is the Hub's own markup - the head-to-head card, the
 * crests, the slot board, the headshots - because "the same view for anyone
 * else's game" is only true if it is literally the same view. What it leaves
 * out is the Hub's interaction: no compare, no bench swaps, no preview. Those
 * price YOUR decisions, and you cannot set another manager's lineup.
 */
export function MatchupDetail({
  left,
  right,
  total,
  leftStarters,
  rightStarters,
  week,
  onClose,
}: MatchupDetailProps) {
  const { format } = useOddsFormat();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /* The scrim closes on a press that BEGAN on the scrim.
   *
   * On a plain onClick it closed the instant it opened: the press that opened
   * the dialog finishes over the scrim that did not exist when the press
   * started, and the tail of that same interaction dismissed it. The same
   * guard stops a text selection dragged out of the panel from closing it,
   * which is the version of this bug people hit later and cannot describe.
   */
  const [scrimArmed, setScrimArmed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* The page behind must not scroll while this is over it, or dismissing the
     dialog returns you somewhere other than where you opened it. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* preventScroll, and then explicitly at the top.
   *
   * Focusing the panel to catch Escape also asks the browser to bring the
   * focused node into view, which scrolled the head-to-head card off the top
   * of its own dialog: it opened part way down, on the lineup board, with the
   * card the game is named after cut in half. */
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  const rows =
    leftStarters?.length || rightStarters?.length
      ? pairLineups(leftStarters ?? [], rightStarters ?? [])
      : [];

  /* One switch, both sides. The header's price/percent toggle governs every
     number in the app and this is not the screen to make an exception. */
  const priceText = (side: BoardTeam) =>
    format === 'percent' ? `${side.winProb.toFixed(1)}%` : formatAmericanOdds(side.odds);

  const identity = (side: BoardTeam, opponent: boolean) => (
    <div
      className={[
        'matchup-page__faceoff-identity',
        opponent ? 'matchup-page__faceoff-identity--opp' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TeamCrest avatarUrl={side.avatarUrl} isUser={side.isUser} teamName={side.name} />
      <div>
        <p className="matchup-page__team-name">{side.name}</p>
        <p className="matchup-page__meta-copy">{managerLine(side.ownerName, side.record)}</p>
      </div>
    </div>
  );

  const heroSide = (side: BoardTeam, opponent: boolean) => (
    <div
      className={[
        'matchup-page__faceoff-side',
        opponent ? 'matchup-page__faceoff-side--opp' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {identity(side, opponent)}
      <span
        className={[
          'matchup-page__hero-number',
          opponent ? 'matchup-page__hero-number--opp' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {priceText(side)}
      </span>
      <p className="matchup-page__meta-copy">
        Proj <span className="matchup-page__inline-number">{pointsText(side.projection)}</span> pts
      </p>
    </div>
  );

  const slotFace = (entry: LineupSlotEntry | null, opponent: boolean) => {
    if (!entry) return <span className="matchup-page__slot-empty">No starter</span>;
    if (entry.playerId == null) return <span className="matchup-page__slot-empty">Empty slot</span>;

    const headshot = (
      <PlayerHeadshot
        className={`matchup-page__slot-headshot matchup-page__slot-headshot--${opponent ? 'opp' : 'user'}`}
        fallbackClassName="matchup-page__headshot-fallback"
        imageClassName="matchup-page__headshot-image"
        name={entry.name}
        player={entry.player}
        position={entry.position ?? undefined}
      />
    );
    const copy = (
      <span
        className={[
          'matchup-page__slot-copy',
          opponent ? 'matchup-page__slot-copy--right' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* The same short form the Hub's rows use, computed here rather than
            only read off a full player record: a row should not print
            "Marvin Harrison Jr." on one screen and "M. Harrison Jr." on
            another depending on how much of the record reached it. */}
        <span className="matchup-page__row-name">
          {entry.player?.shortName ?? playerShortName(entry.name, entry.position)}
        </span>
        <span className="matchup-page__row-secondary">
          <span className="matchup-page__meta-full">{metaFor(entry)}</span>
          {entry.injuryStatus ? (
            <span className="matchup-page__slot-bench-cue">{entry.injuryStatus}</span>
          ) : null}
        </span>
      </span>
    );
    const numbers = (
      <span
        className={[
          'matchup-page__slot-numbers',
          opponent ? 'matchup-page__slot-numbers--right' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="matchup-page__slot-projection">{pointsText(entry.projection)}</span>
      </span>
    );

    return opponent ? (
      <>
        {numbers}
        {copy}
        {headshot}
      </>
    ) : (
      <>
        {headshot}
        {copy}
        {numbers}
      </>
    );
  };

  return createPortal(
    <div className="matchup-modal" role="presentation">
      <div
        className="matchup-modal__scrim"
        onMouseDown={() => setScrimArmed(true)}
        onMouseUp={() => {
          if (scrimArmed) onClose();
          setScrimArmed(false);
        }}
        role="presentation"
      />
      <div
        aria-label={`${left.name} versus ${right.name}`}
        aria-modal="true"
        className="matchup-modal__panel"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label="Close matchup"
          className="matchup-modal__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>

        <div className="matchup-modal__scroll" ref={scrollRef}>
          <section className="matchup-page__module matchup-page__module--hero">
            <div className="matchup-page__module-row">
              <span className="matchup-page__eyebrow">Week {week} · head-to-head</span>
            </div>

            <div className="matchup-page__faceoff">
              {heroSide(left, false)}
              <div aria-hidden="true" className="matchup-page__faceoff-vs">
                VS
              </div>
              {heroSide(right, true)}
            </div>

            <div
              aria-label={`Win probability ${left.winProb.toFixed(1)}%`}
              className="matchup-page__winbar"
            >
              <span
                className="matchup-page__winbar-fill"
                style={{ width: `${left.winProb}%` }}
              />
            </div>
            <div className="matchup-page__winbar-labels">
              <span className="matchup-page__winbar-label matchup-page__winbar-label--user">
                {left.winProb.toFixed(1)}%
              </span>
              <span className="matchup-page__winbar-label">{right.winProb.toFixed(1)}%</span>
            </div>

            <div className="matchup-page__hero-meta-row">
              <span className="matchup-page__meta-copy">
                Spread{' '}
                <span className="matchup-page__inline-number">
                  {spreadLabel(left.spread) || NO_VALUE}
                </span>
              </span>
              <span className="matchup-page__meta-copy">
                Total <span className="matchup-page__inline-number">{pointsText(total)}</span>
              </span>
            </div>
          </section>

          {rows.length > 0 ? (
            <section className="matchup-page__module matchup-page__module--slot-board">
              <div className="matchup-page__module-row matchup-page__module-row--lineup">
                <div>
                  <h2 className="matchup-page__module-title">Lineup vs lineup</h2>
                </div>
              </div>

              <div className="matchup-page__slot-board-grid">
                <div className="matchup-page__slot-board-head matchup-page__slot-board-head--left">
                  {left.isUser ? (
                    <span className="matchup-page__side-pill matchup-page__side-pill--you">You</span>
                  ) : null}
                  {left.name}
                </div>
                <div className="matchup-page__slot-board-head matchup-page__slot-board-head--center" />
                <div className="matchup-page__slot-board-head matchup-page__slot-board-head--right">
                  {right.name}
                  {right.isUser ? (
                    <span className="matchup-page__side-pill matchup-page__side-pill--you">You</span>
                  ) : null}
                </div>

                {rows.map((row, index) => {
                  const leftLeads = row.edge === 'left';
                  const delta =
                    row.left?.projection != null && row.right?.projection != null
                      ? Math.abs(row.left.projection - row.right.projection)
                      : 0;

                  return (
                    <Fragment key={`${row.slot}-${index}`}>
                      <div className="matchup-page__slot-card">{slotFace(row.left, false)}</div>

                      <div className="matchup-page__slot-center">
                        <span className="matchup-page__slot-slot-label">{row.slot}</span>
                        {delta > 0 ? (
                          <span
                            /* The Hub's green means "your side leads this
                               slot". On somebody else's game neither side is
                               you, so the leading team gets the neutral
                               treatment rather than a colour that quietly
                               claims a team is yours. */
                            className={[
                              'matchup-page__slot-margin',
                              (leftLeads ? left.isUser : right.isUser)
                                ? 'matchup-page__slot-margin--you'
                                : 'matchup-page__slot-margin--them',
                            ].join(' ')}
                            title={`${leftLeads ? left.name : right.name} by ${delta.toFixed(1)}`}
                          >
                            <span aria-hidden="true" className="matchup-page__slot-margin-caret">
                              {leftLeads ? '◀' : '▶'}
                            </span>
                            {delta.toFixed(1)}
                          </span>
                        ) : null}
                      </div>

                      <div className="matchup-page__slot-card matchup-page__slot-card--right matchup-page__slot-card--opponent">
                        {slotFace(row.right, true)}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="matchup-modal__empty">
              Connect your league to see both lineups here.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
