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
  /** The season, as the band above the hub already prints it. */
  season?: {
    title?: string | null;
    playoffs?: string | null;
    finish?: string | null;
    seed?: string | null;
  } | null;
  /** e.g. { rank: 2, of: 12 } — where they sit for the rest of the season. */
  power?: { rank: number; of: number } | null;
  /** e.g. "Opened -116, now -156" */
  movement?: string | null;
}

const W = 1080;
const H = 1080;
const PAD = 88;

const INK = '#f4f5f2';
const MUTED = 'rgba(244,245,242,0.52)';
const FAINT = 'rgba(244,245,242,0.34)';
const ACCENT = '#ff8049';
const AMBER = '#e8541d';
const BG = '#0d0f11';
const SURFACE = '#16120f';

const DISPLAY = 'Staatliches, "Arial Narrow", sans-serif';
const UI = '"Hanken Grotesk", system-ui, sans-serif';
const NUM = '"JetBrains Mono", ui-monospace, monospace';

/**
 * A canvas paints whatever is loaded at the moment it draws, so a card built
 * before the webfonts arrive silently falls back to system type. That is why
 * this used to be hardcoded to system-ui: the original note said a canvas
 * cannot wait on webfonts. It can. document.fonts.load resolves when the face
 * is usable, so the card waits and then looks like the product.
 */
async function ensureBrandFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return;
  try {
    await Promise.all([
      fonts.load('400 190px Staatliches'),
      fonts.load('600 34px "Hanken Grotesk"'),
      fonts.load('700 34px "Hanken Grotesk"'),
      fonts.load('700 54px "JetBrains Mono"'),
    ]);
    await fonts.ready;
  } catch {
    // A missing face is not a reason to refuse to draw the card.
  }
}

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

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left') {
  ctx.fillStyle = FAINT;
  ctx.font = `700 21px ${UI}`;
  ctx.letterSpacing = '3px';
  ctx.textAlign = align;
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

/** Square, because every chat app previews square without cropping. */
export async function drawShareCard(line: ShareCardLine): Promise<HTMLCanvasElement> {
  await ensureBrandFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const wash = ctx.createLinearGradient(0, 0, 0, 460);
  wash.addColorStop(0, 'rgba(232,84,29,0.18)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 460);

  ctx.textBaseline = 'alphabetic';

  // ── mark and week ────────────────────────────────────────────────────────
  ctx.fillStyle = ACCENT;
  ctx.font = `400 32px ${DISPLAY}`;
  ctx.letterSpacing = '7px';
  ctx.textAlign = 'left';
  ctx.fillText('ODDS GODS', PAD, 112);
  ctx.letterSpacing = '0px';

  label(ctx, line.eyebrow, W - PAD, 112, 'right');

  // ── the matchup ──────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${UI}`;
  ctx.fillText(line.you, PAD, 214);
  ctx.textAlign = 'right';
  ctx.fillText(line.them, W - PAD, 214);

  ctx.textAlign = 'left';
  ctx.fillStyle = ACCENT;
  ctx.font = `400 168px ${DISPLAY}`;
  ctx.fillText(line.yourPrice, PAD, 360);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.fillText(line.theirPrice, W - PAD, 360);

  // win probability, drawn the way the hub draws it
  const barY = 410;
  const barW = W - PAD * 2;
  const pct = Math.max(0, Math.min(100, line.yourWinPct));
  ctx.fillStyle = 'rgba(244,245,242,0.10)';
  roundRect(ctx, PAD, barY, barW, 14, 7);
  ctx.fill();
  const fill = ctx.createLinearGradient(PAD, 0, PAD + barW * (pct / 100), 0);
  fill.addColorStop(0, AMBER);
  fill.addColorStop(1, ACCENT);
  ctx.fillStyle = fill;
  roundRect(ctx, PAD, barY, Math.max(14, barW * (pct / 100)), 14, 7);
  ctx.fill();

  ctx.font = `700 30px ${NUM}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = ACCENT;
  ctx.fillText(`${pct.toFixed(1)}%`, PAD, barY + 62);
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.fillText(`${(100 - pct).toFixed(1)}%`, W - PAD, barY + 62);

  // ── the season ───────────────────────────────────────────────────────────
  const cells = [
    { k: 'Title', v: line.season?.title },
    { k: 'Playoffs', v: line.season?.playoffs },
    { k: 'Finish', v: line.season?.finish },
    { k: 'Seed', v: line.season?.seed },
  ].filter((cell) => Boolean(cell.v));

  let cursor = 540;
  if (cells.length > 0) {
    const boxH = 196;
    ctx.fillStyle = SURFACE;
    roundRect(ctx, PAD, cursor, W - PAD * 2, boxH, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,84,29,0.22)';
    ctx.lineWidth = 2;
    roundRect(ctx, PAD, cursor, W - PAD * 2, boxH, 28);
    ctx.stroke();

    const inner = W - PAD * 2;
    const colW = inner / cells.length;
    cells.forEach((cell, index) => {
      const cx = PAD + colW * index + colW / 2;
      label(ctx, cell.k, cx, cursor + 62, 'center');
      ctx.textAlign = 'center';
      ctx.fillStyle = index === 0 ? ACCENT : INK;
      ctx.font = `700 52px ${NUM}`;
      ctx.fillText(String(cell.v), cx, cursor + 134);
    });
    cursor += boxH + 56;
  }

  // ── where they stand, and how the line has moved ─────────────────────────
  if (line.power) {
    ctx.textAlign = 'left';
    label(ctx, 'Power ranking, rest of season', PAD, cursor + 6);
    ctx.fillStyle = INK;
    ctx.font = `400 96px ${DISPLAY}`;
    ctx.fillText(`${line.power.rank}`, PAD, cursor + 106);
    const width = ctx.measureText(`${line.power.rank}`).width;
    ctx.fillStyle = MUTED;
    ctx.font = `600 38px ${UI}`;
    ctx.fillText(`of ${line.power.of}`, PAD + width + 18, cursor + 106);
    cursor += 150;
  }

  /* Pinned to the foot rather than following the flow above, so the movement
     line and the wordmark keep the same gap whether or not a power ranking
     was drawn. They were landing 46px apart and reading as one block. */
  if (line.movement) {
    ctx.textAlign = 'left';
    ctx.fillStyle = FAINT;
    ctx.font = `600 26px ${UI}`;
    ctx.fillText(line.movement, PAD, H - 132);
  }

  // ── footer ───────────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(244,245,242,0.22)';
  ctx.font = `600 25px ${UI}`;
  ctx.fillText('oddsgods.net', PAD, H - 58);

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
    const canvas = await drawShareCard(line);
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
