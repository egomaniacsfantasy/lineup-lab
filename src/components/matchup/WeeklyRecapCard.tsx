import { useRef, useState } from 'react';
import './WeeklyRecapCard.css';

// TEMP: mock Week 7 result for share card demo. Replace with real recap data from API when available.
const WEEKLY_RECAP = {
  week: 7,
  closedLine: -180,
  resultMargin: 12,
  finalScore: '132.4 - 120.1',
  biggestContributor: 'J. Jefferson · 28.4 pts',
  bestDecision: 'Started Waddle over Adams · +6.2% line move',
  movement: [
    { label: 'Mon', value: -180 },
    { label: 'Thu', value: -205 },
    { label: 'Final', value: -180 },
  ],
};

const RECAP_SESSION_KEY = 'og.lineuplab.week7-recap.dismissed';

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3 8.3 13 3 9.8 13l-2-4.2L3 8.3Z" />
      <path d="M7.8 8.8 13 3" />
    </svg>
  );
}

function drawShareImage() {
  const canvas = document.createElement('canvas');
  const size = 1080;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(880, 120, 0, 880, 120, 520);
  glow.addColorStop(0, 'rgba(215, 154, 36, 0.18)');
  glow.addColorStop(1, 'rgba(215, 154, 36, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(140, 156, 184, 0.22)';
  ctx.lineWidth = 2;
  ctx.roundRect(90, 110, 900, 760, 32);
  ctx.stroke();
  ctx.fillStyle = '#111826';
  ctx.fill();

  ctx.fillStyle = '#8d99ae';
  ctx.font = '700 28px IBM Plex Mono, monospace';
  ctx.letterSpacing = '4px';
  ctx.fillText('WEEK 7 RECAP', 150, 190);

  ctx.fillStyle = '#f4f7fb';
  ctx.font = 'italic 84px Instrument Serif, serif';
  ctx.fillText('You closed at -180.', 150, 300);
  ctx.fillText('You won by 12.', 150, 385);

  ctx.fillStyle = 'rgba(220, 227, 238, 0.78)';
  ctx.font = '500 34px Manrope, sans-serif';
  ctx.fillText('The book called it. So did you.', 150, 455);

  ctx.strokeStyle = '#d79a24';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(180, 585);
  ctx.lineTo(540, 540);
  ctx.lineTo(900, 585);
  ctx.stroke();

  WEEKLY_RECAP.movement.forEach((point, index) => {
    const x = 180 + index * 360;
    const y = index === 1 ? 540 : 585;
    ctx.fillStyle = '#d79a24';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d99ae';
    ctx.font = '700 24px IBM Plex Mono, monospace';
    ctx.fillText(point.label, x - 24, y + 56);
    ctx.fillStyle = '#f4f7fb';
    ctx.fillText(String(point.value), x - 34, y - 28);
  });

  ctx.fillStyle = '#8d99ae';
  ctx.font = '700 22px IBM Plex Mono, monospace';
  ctx.fillText('FINAL SCORE', 150, 725);
  ctx.fillText('BIGGEST CONTRIBUTOR', 405, 725);
  ctx.fillText('BEST DECISION', 710, 725);

  ctx.fillStyle = '#f4f7fb';
  ctx.font = '800 28px Manrope, sans-serif';
  ctx.fillText(WEEKLY_RECAP.finalScore, 150, 770);
  ctx.fillText('J. Jefferson', 405, 770);
  ctx.fillText('Waddle > Adams', 710, 770);

  ctx.fillStyle = '#8d99ae';
  ctx.font = '700 24px IBM Plex Mono, monospace';
  ctx.fillText('ODDS GODS / LINEUP LAB', 90, 965);
  ctx.fillText('lineuplab.oddsgods.net', 690, 965);

  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'lineup-lab-week-7-recap.png';
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function WeeklyRecapCard() {
  const [isDismissed, setIsDismissed] = useState(
    () => window.sessionStorage.getItem(RECAP_SESSION_KEY) === 'true',
  );
  const cardRef = useRef<HTMLElement | null>(null);

  if (isDismissed) {
    return null;
  }

  return (
    <section
      aria-labelledby="weekly-recap-title"
      className="weekly-recap-card"
      ref={cardRef}
    >
      <button
        aria-label="Dismiss Week 7 recap"
        className="weekly-recap-card__dismiss"
        onClick={() => {
          window.sessionStorage.setItem(RECAP_SESSION_KEY, 'true');
          setIsDismissed(true);
        }}
        type="button"
      >
        ×
      </button>

      <div className="weekly-recap-card__copy">
        <p className="weekly-recap-card__kicker">Week {WEEKLY_RECAP.week} recap</p>
        <h2 className="weekly-recap-card__title" id="weekly-recap-title">
          You closed at {WEEKLY_RECAP.closedLine}. You won by {WEEKLY_RECAP.resultMargin}.
        </h2>
        <p className="weekly-recap-card__subhead">The book called it. So did you.</p>
      </div>

      <div className="weekly-recap-card__chart" aria-label="Line movement from Monday to final">
        {WEEKLY_RECAP.movement.map((point, index) => (
          <div className="weekly-recap-card__point" key={point.label}>
            <span className="weekly-recap-card__odds">{point.value}</span>
            <span
              className={[
                'weekly-recap-card__dot',
                index === 1 ? 'weekly-recap-card__dot--peak' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <span className="weekly-recap-card__point-label">{point.label}</span>
          </div>
        ))}
      </div>

      <div className="weekly-recap-card__stats">
        <div>
          <span>Final score</span>
          <strong>{WEEKLY_RECAP.finalScore}</strong>
        </div>
        <div>
          <span>Biggest contributor</span>
          <strong>{WEEKLY_RECAP.biggestContributor}</strong>
        </div>
        <div>
          <span>Best decision</span>
          <strong>{WEEKLY_RECAP.bestDecision}</strong>
        </div>
      </div>

      <button className="weekly-recap-card__share" onClick={drawShareImage} type="button">
        <ShareIcon />
        Share recap
      </button>
    </section>
  );
}
