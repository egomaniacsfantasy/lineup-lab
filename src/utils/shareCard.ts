/**
 * Share cards.
 *
 * Your league argues in a group chat, and the book's job is to settle it. A
 * screenshot of a line is the most shareable thing this product makes, so it
 * should be one tap and it should look like us, not like a cropped browser.
 *
 * Boundary: this draws numbers that are ALREADY on screen. It formats and
 * paints; it never computes a probability, a price or a delta.
 */

export interface ShareCardLine {
  /** e.g. "Zeus's Bolts" */
  you: string;
  /** e.g. "Hermes Express" */
  them: string;
  /** Already formatted, e.g. "-159" */
  yourPrice: string;
  /** Already formatted, e.g. "+159" */
  theirPrice: string;
  /** 0-100, as displayed */
  yourWinPct: number;
  /** e.g. "Week 8" */
  eyebrow: string;
  /** Optional line under the numbers, e.g. "On average you win by 6.6." */
  note?: string | null;
}

const W = 1080;
const H = 1080;

const INK = '#f4f5f2';
const MUTED = 'rgba(244,245,242,0.55)';
const ACCENT = '#ff8049';
const BG = '#0d0f11';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Square card, because every chat app previews square without cropping.
 * Fonts fall back to the system stack: a canvas cannot wait on webfonts and a
 * card that renders late is a card nobody shares.
 */
export function drawShareCard(line: ShareCardLine): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Warm top edge, the same accent wash the app's cards carry.
  const wash = ctx.createLinearGradient(0, 0, 0, 420);
  wash.addColorStop(0, 'rgba(232,84,29,0.16)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 420);

  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = MUTED;
  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText(line.eyebrow.toUpperCase(), 84, 132);
  ctx.letterSpacing = '0px';

  // Your side leads: this is a card about your team.
  ctx.fillStyle = INK;
  ctx.font = '700 52px system-ui, -apple-system, sans-serif';
  ctx.fillText(line.you, 84, 268);

  ctx.fillStyle = ACCENT;
  ctx.font = '800 190px system-ui, -apple-system, sans-serif';
  ctx.fillText(line.yourPrice, 84, 452);

  ctx.fillStyle = MUTED;
  ctx.font = '500 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${line.yourWinPct.toFixed(1)}% to win`, 84, 516);

  // Their side, deliberately quieter.
  ctx.fillStyle = 'rgba(244,245,242,0.72)';
  ctx.font = '600 38px system-ui, -apple-system, sans-serif';
  ctx.fillText(line.them, 84, 636);
  ctx.fillStyle = MUTED;
  ctx.font = '700 72px system-ui, -apple-system, sans-serif';
  ctx.fillText(line.theirPrice, 84, 722);

  // Win-share bar.
  const barY = 800;
  const barW = W - 168;
  ctx.fillStyle = 'rgba(244,245,242,0.12)';
  roundRect(ctx, 84, barY, barW, 18, 9);
  ctx.fill();
  const fill = ctx.createLinearGradient(84, 0, 84 + barW, 0);
  fill.addColorStop(0, '#e8541d');
  fill.addColorStop(1, '#ff8049');
  ctx.fillStyle = fill;
  const pct = Math.max(0, Math.min(100, line.yourWinPct)) / 100;
  roundRect(ctx, 84, barY, Math.max(18, barW * pct), 18, 9);
  ctx.fill();

  /* The note is optional, so the wordmark closes up behind it rather than
     leaving a hole in the middle of the card when there is nothing to say. */
  let markY = 892;
  if (line.note) {
    ctx.fillStyle = 'rgba(244,245,242,0.7)';
    ctx.font = '500 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(line.note, 84, 890);
    markY = 996;
  }

  // Wordmark. No URL: chat apps linkify them and it reads as an ad.
  ctx.fillStyle = MUTED;
  ctx.font = '700 30px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('ODDS GODS', 84, markY);
  ctx.letterSpacing = '0px';

  return canvas;
}

export function shareCardToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Hands the card to the OS share sheet where that exists (every phone, and the
 * native app), and falls back to a download on desktop browsers that have no
 * share target. Returns how it was handled so the caller can confirm.
 */
export async function shareCard(
  line: ShareCardLine,
  filename = 'odds-gods.png',
): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const canvas = drawShareCard(line);
    const blob = await shareCardToBlob(canvas);
    if (!blob) return 'failed';

    const file = new File([blob], filename, { type: 'image/png' });
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[]; title?: string }) => Promise<void>;
    };

    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: 'Odds Gods' });
      return 'shared';
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
