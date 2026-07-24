import { useEffect, useState } from 'react';
import { BoardPlayerCard } from './MyBoardPage';

const HARNESS_PLAYER = {
  adjustedValue: 57,
  vor: 18,
  board: {
    rank: 42,
    playerId: 'jayden-daniels',
    name: 'Jayden Daniels',
    position: 'QB',
    team: 'WAS',
    mean: 0,
    stdev: 0,
    floor: 238,
    ceiling: 388,
    seasonTotal: 309,
    weekly: {},
    tier: 4,
    derived: false,
  },
  projection: {
    id: 'jayden-daniels',
    position: 'QB' as const,
    name: 'Jayden Daniels',
    team: 'WAS',
    depthRank: 1,
    point: 309,
    floor: 238,
    ceiling: 388,
    season: {
      passing_yards_adj: 3621,
      passing_tds_adj: 24,
      rushing_yards_adj: 781,
      rushing_tds_adj: 7,
      interceptions_adj: 10,
      fumbles_adj: 8,
    },
    weekly: [{ week: 8, opponent: 'DAL', game_location: 1 }],
  },
};

export function DesignBoardLoopPage() {
  const [tick, setTick] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [myCallsOnly, setMyCallsOnly] = useState(false);
  const [savedRating, setSavedRating] = useState('50');
  const [draftRating, setDraftRating] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<'saving' | 'ok' | 'pending' | 'err' | undefined>(undefined);
  const [saveMessage, setSaveMessage] = useState('');
  const [rowMotionState, setRowMotionState] = useState<'moved' | 'recalculating' | null>(null);
  const influenceChip =
    Number(savedRating) > 50 ? 'YOU ▲' : Number(savedRating) < 50 ? 'YOU ▼' : null;
  const showRow = !myCallsOnly || influenceChip != null;

  useEffect(() => {
    const timer = window.setInterval(() => setTick((current) => current + 1), 60);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="board-page" data-rerender-tick={tick}>
      <header className="board-page__hero">
        <div className="board-page__hero-copy">
          <p className="board-page__eyebrow">Design</p>
          <h2 className="board-page__title">Board loop harness</h2>
          <p className="board-page__caption">Stress test for rating drag under constant rerenders.</p>
        </div>
      </header>

      <section className="board-page__filter-bar" aria-label="Board input harness">
        <div className="board-page__position-row">
          <button className="board-page__chip board-page__chip--active" type="button">
            Search loop
          </button>
          <button
            className={[
              'board-page__chip',
              myCallsOnly ? 'board-page__chip--active' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => setMyCallsOnly((current) => !current)}
            type="button"
          >
            My calls ({influenceChip ? 1 : 0})
          </button>
        </div>
        <input
          className="board-page__search"
          onChange={(event) => setSearchValue(event.currentTarget.value)}
          placeholder="Search player or team"
          type="search"
          value={searchValue}
        />
      </section>

      <section className="board-page__stack" aria-label="Board loop harness">
        {showRow ? (
          <article
            className={[
              'board-page__row',
              'board-page__row--open',
              rowMotionState === 'moved' ? 'board-page__row--moved' : '',
              rowMotionState === 'recalculating' ? 'board-page__row--recalculating' : '',
            ].filter(Boolean).join(' ')}
          >
            <BoardPlayerCard
              currentWeek={8}
              draftRating={draftRating}
              influenceChip={influenceChip}
              mode="standalone"
              onClose={() => null}
              onCommit={(value) => {
                setDraftRating(String(value));
                setSavingState('saving');
                setRowMotionState(null);
                window.setTimeout(() => {
                  setSavedRating(String(value));
                  setDraftRating(null);
                  setSavingState('ok');
                  setRowMotionState('moved');
                  setSaveMessage(
                    value > 50
                      ? `Saved: ${value}. He climbs your board.`
                      : value < 50
                        ? `Saved: ${value}. He falls.`
                        : `Saved: ${value}. Aligned with Franco.`,
                  );
                  window.setTimeout(() => setRowMotionState(null), 1800);
                }, 180);
              }}
              onDraftChange={(value) => setDraftRating(String(value))}
              player={HARNESS_PLAYER}
              rank={42}
              rating={savedRating}
              rowMotionState={savingState === 'pending' ? 'recalculating' : rowMotionState}
              saveError=""
              saveMessage={saveMessage}
              savingState={savingState}
            />
          </article>
        ) : (
          <p className="board-page__empty">My calls is on. No rated players are hidden in this harness state.</p>
        )}
      </section>
    </div>
  );
}
