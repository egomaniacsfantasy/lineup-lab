import { useEffect, useMemo } from 'react';
import type { PlayerDetailRequest } from '../../contexts/PlayerDetailContext';
import { getPlayerManifestEntry } from '../../data/playerManifest';
import { hashString, roundTo } from '../../utils/lineupComparison';
import { PlayerHeadshot } from './PlayerHeadshot';
import { Gloss } from '../ui/Gloss';
import './PlayerDetailPanel.css';

interface PlayerDetailPanelProps {
  playerDetail: PlayerDetailRequest | null;
  onClose: () => void;
}

const NEWS_TEMPLATES = [
  ['ESPN', '{last} practiced in full and remains on track for the week.'],
  ['Fantasy Wire', '{last} is seeing steady usage in high-leverage looks.'],
  ['Beat report', '{last} drew extra red-zone work during the open period.'],
  ['ESPN', '{last} has no new injury designation after walkthroughs.'],
  ['Fantasy Wire', 'Coaches expect {last} to keep the same role this week.'],
  ['Beat report', '{last} handled the normal rep share in team drills.'],
  ['ESPN', '{last} remains a featured piece in the weekly plan.'],
  ['Fantasy Wire', 'The matchup keeps {last} in a playable range.'],
  ['Beat report', '{last} was not listed on the final injury report.'],
  ['ESPN', '{last} is expected to be available for the full script.'],
];

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
  const floor = playerDetail?.floor ?? detail.floor;
  const ceiling = playerDetail?.ceiling ?? detail.ceiling;
  const gameLine = playerDetail?.gameLine ?? detail.matchup;
  const lastName = getLastName(fullName);
  const newsItems = useMemo(
    () =>
      [0, 1, 2].map((index) => {
        const template = NEWS_TEMPLATES[(detail.newsSeed + index) % NEWS_TEMPLATES.length];

        return {
          source: template[0],
          text: template[1].replace('{last}', lastName),
          date: `Apr ${22 - index}`,
        };
      }),
    [detail.newsSeed, lastName],
  );
  const maxRecent = Math.max(...detail.recent.map((game) => game.points));

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
            <p className="player-detail-panel__game">{gameLine}</p>
            <p className="player-detail-panel__projection">
              <Gloss term="projection">Projection</Gloss>:{' '}
              <strong>{projection.toFixed(1)} pts</strong> · Floor{' '}
              {floor.toFixed(1)} / Ceiling {ceiling.toFixed(1)}
            </p>
          </section>

          <section className="player-detail-panel__section">
            <p className="player-detail-panel__section-label">Last four weeks</p>
            <div className="player-detail-panel__bars" aria-label="Last four fantasy scores">
              {detail.recent.map((game) => (
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
