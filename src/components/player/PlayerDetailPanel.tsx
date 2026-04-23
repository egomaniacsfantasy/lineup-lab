import { useEffect, useMemo } from 'react';
import type { PlayerDetailRequest } from '../../contexts/PlayerDetailContext';
import { getPlayerManifestEntry } from '../../data/playerManifest';
import { hashString, roundTo } from '../../utils/lineupComparison';
import { PlayerHeadshot } from './PlayerHeadshot';
import './PlayerDetailPanel.css';

interface PlayerDetailPanelProps {
  playerDetail: PlayerDetailRequest | null;
  onClose: () => void;
}

const NEWS_TEMPLATES = [
  ['ESPN', '{last} logged a full practice Friday and is tracking toward his normal Week 8 role.'],
  ['The Athletic', "{last}'s usage has held steady over the last month of the 2024 replay window."],
  ['Rotoworld', 'Coaches expect {last} to see the high-leverage snaps against {opponent} this week.'],
  ['NFL Network', '{last} was not listed with a new injury designation entering the weekend.'],
  ['PFF', '{last} remains a top-15 positional usage profile through Week 7.'],
  ['ESPN', "{last}'s matchup grade improved after the final Week 8 injury report."],
  ['Fantasy Wire', 'The Week 8 script keeps {last} in the playable range for PPR formats.'],
  ['Beat report', '{last} handled the expected rep share during the open practice window.'],
  ['Rotoworld', "{last}'s route and touch profile remains stable heading into {opponent}."],
  ['The Athletic', 'The market is treating {last} as a steady-volume option for Week 8.'],
];

const DEFENSE_NEWS_TEMPLATES = [
  ['ESPN', '{last} allowed fewer than 20 points per game across the first half of the 2024 replay.'],
  ['The Athletic', "{last}'s pressure profile remains one of the cleaner Week 8 matchup levers."],
  ['PFF', '{last} carries a turnover-path matchup into the {opponent} game.'],
];

const NEWS_DATES = ['Oct 28, 2024', 'Oct 26, 2024', 'Oct 24, 2024'];

const OPPONENTS = ['DEN', 'BUF', 'PHI', 'DAL', 'MIA', 'BAL', 'SF', 'DET'];

function getLastName(name: string) {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

function getSyntheticDetail(slug: string, projection = 12) {
  const hash = hashString(slug);
  const opponent = OPPONENTS[hash % OPPONENTS.length];
  const kickoff = hash % 3 === 0 ? 'Sun 4:25pm' : hash % 3 === 1 ? 'Sun 1pm' : 'Mon 8:15pm';
  const spread = ((hash % 29) - 14) / 2;
  const points = [0, 1, 2, 3].map((index) =>
    roundTo(Math.max(3.2, projection + (((hash >> (index * 3)) % 13) - 6))),
  );

  return {
    matchup: `vs. ${opponent} · ${kickoff} · ${spread > 0 ? '+' : ''}${spread.toFixed(1)} -110`,
    floor: roundTo(Math.max(1, projection * 0.64)),
    ceiling: roundTo(projection * 1.42),
    recent: points.map((point, index) => ({
      opponent: OPPONENTS[(hash + index + 2) % OPPONENTS.length],
      points: point,
    })),
    newsSeed: hash,
  };
}

export function PlayerDetailPanel({ playerDetail, onClose }: PlayerDetailPanelProps) {
  const manifestEntry = playerDetail ? getPlayerManifestEntry(playerDetail.slug) : null;
  const player = playerDetail?.player;
  const fullName = player?.name ?? manifestEntry?.fullName ?? 'Player';
  const displayName = player?.shortName ?? manifestEntry?.displayName ?? fullName;
  const position = player?.position ?? manifestEntry?.position ?? 'WR';
  const team = player?.team ?? manifestEntry?.team ?? '';
  const projection = playerDetail?.projection ?? 12;
  const detail = useMemo(
    () => getSyntheticDetail(playerDetail?.slug ?? 'player', projection),
    [playerDetail?.slug, projection],
  );
  const week8 = manifestEntry?.week8_2024;
  const recentGames = manifestEntry?.last4_2024.map((game) => ({
    opponent: game.opponent,
    points: game.pts,
  })) ?? detail.recent;
  const replayScores = [
    ...recentGames.map((game) => game.points).filter((points) => points > 0),
    week8?.pprPoints ?? 0,
  ].filter((points) => points > 0);
  const floor = playerDetail?.floor ?? (replayScores.length > 0 ? Math.min(...replayScores) : detail.floor);
  const ceiling =
    playerDetail?.ceiling ?? (replayScores.length > 0 ? Math.max(...replayScores) : detail.ceiling);
  const gameLine = playerDetail?.gameLine ?? week8?.gameLine ?? detail.matchup;
  const lastName = getLastName(fullName);
  const newsItems = [0, 1, 2].map((index) => {
    const sourcePool = position === 'DEF' ? DEFENSE_NEWS_TEMPLATES : NEWS_TEMPLATES;
    const template = sourcePool[(detail.newsSeed + index) % sourcePool.length];

    return {
      source: template[0],
      text: template[1]
        .replace('{last}', lastName)
        .replace('{opponent}', week8?.opponent ?? 'the opponent'),
      date: NEWS_DATES[index],
    };
  });
  const maxRecent = Math.max(...recentGames.map((game) => game.points), 1);

  useEffect(() => {
    if (!playerDetail) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, playerDetail]);

  const handleComparedClick = () => {
    if (playerDetail?.comparedSlotIndex === undefined) {
      return;
    }

    onClose();
    window.dispatchEvent(
      new CustomEvent('lineuplab:highlight-slot', {
        detail: { slotIndex: playerDetail.comparedSlotIndex },
      }),
    );
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-roster-slot-index="${playerDetail.comparedSlotIndex}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <aside
      aria-hidden={!playerDetail}
      aria-label={playerDetail ? `${displayName} detail panel` : undefined}
      className={[
        'player-detail-panel',
        playerDetail ? 'player-detail-panel--open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {playerDetail && manifestEntry ? (
        <div className="player-detail-panel__inner">
          <header className="player-detail-panel__header">
            <PlayerHeadshot
              className="player-detail-panel__headshot"
              name={displayName}
              position={position}
              slug={playerDetail.slug}
            />
            <div className="player-detail-panel__identity">
              <p className="player-detail-panel__eyebrow">Player detail</p>
              <h2 className="player-detail-panel__name">{fullName}</h2>
              <p className="player-detail-panel__meta">
                {position} · {team}
                {manifestEntry.jerseyNumber ? ` · #${manifestEntry.jerseyNumber}` : ''}
              </p>
            </div>
            <button
              aria-label="Close player detail"
              className="player-detail-panel__close"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="player-detail-panel__status">
            <span>{player?.injuryStatus ?? 'Healthy'}</span>
            <span>Bye: Wk {player?.bye ?? 10}</span>
            <span>Owned: {68 + (hashString(playerDetail.slug) % 30)}%</span>
          </div>

          <section className="player-detail-panel__section">
            <p className="player-detail-panel__section-label">This week</p>
            <p className="player-detail-panel__game">
              {week8 ? `vs. ${week8.opponent} · ${week8.kickoff} · ${gameLine}` : gameLine}
            </p>
            <p className="player-detail-panel__projection">
              Projection:{' '}
              <strong>{projection.toFixed(1)} pts</strong> · Floor{' '}
              {floor.toFixed(1)} / Ceiling {ceiling.toFixed(1)}
            </p>
          </section>

          <section className="player-detail-panel__section">
            <p className="player-detail-panel__section-label">Last four weeks</p>
            <div className="player-detail-panel__bars" aria-label="Last four fantasy scores">
              {recentGames.map((game) => (
                <div className="player-detail-panel__bar-group" key={game.opponent}>
                  <span className="player-detail-panel__bar-score">
                    {game.points.toFixed(1)}
                  </span>
                  <span
                    className={[
                      'player-detail-panel__bar',
                      game.points === maxRecent ? 'player-detail-panel__bar--high' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ height: `${Math.max(18, (game.points / maxRecent) * 76)}px` }}
                  />
                  <span className="player-detail-panel__bar-label">{game.opponent}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="player-detail-panel__section">
            <p className="player-detail-panel__section-label">News</p>
            <div className="player-detail-panel__news-list">
              {newsItems.map((item) => (
                <article className="player-detail-panel__news" key={`${item.date}-${item.text}`}>
                  <p className="player-detail-panel__news-meta">
                    {item.date} · {item.source}
                  </p>
                  <h3 className="player-detail-panel__news-title">
                    {lastName} stays in the weekly script
                  </h3>
                  <p className="player-detail-panel__news-body">{item.text}</p>
                </article>
              ))}
            </div>
          </section>

          {playerDetail.comparedSlotIndex !== undefined ? (
            <button
              className="player-detail-panel__swap-link"
              onClick={handleComparedClick}
              type="button"
            >
              Compared in this week&apos;s swap →
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
