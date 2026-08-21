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
  /** Team avatars, already resolved to a fetchable URL. Optional: a league
      with no avatars set still gets a card, it just gets initials. */
  yourAvatar?: string | null;
  theirAvatar?: string | null;
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

/**
 * Load an image for the canvas, or give up quietly.
 *
 * crossOrigin is set because the card is exported with toBlob, and a canvas
 * that has drawn a cross-origin image without CORS is tainted: the export then
 * throws a SecurityError and the whole card is lost rather than one logo. A
 * team avatar can come from our own proxy or, for ESPN, straight off their
 * CDN, so this can never assume same-origin.
 */
function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    /* A hung request must not hold the card hostage. */
    window.setTimeout(() => resolve(img.complete && img.naturalWidth > 0 ? img : null), 2500);
  });
}

function circleImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function crest(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  name: string,
  cx: number,
  cy: number,
  r: number,
  accent: boolean,
) {
  if (img) {
    circleImage(ctx, img, cx, cy, r);
    return;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = accent ? 'rgba(232,84,29,0.22)' : 'rgba(244,245,242,0.10)';
  ctx.fill();
  ctx.fillStyle = accent ? ACCENT : MUTED;
  ctx.font = `400 ${Math.round(r)}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText(initialsFor(name), cx, cy + r * 0.34);
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
export async function drawShareCard(
  line: ShareCardLine,
  { withArt = true }: { withArt?: boolean } = {},
): Promise<HTMLCanvasElement> {
  await ensureBrandFonts();

  const [mark, yourCrest, theirCrest] = withArt
    ? await Promise.all([
        loadImage('/og-logo.png'),
        loadImage(line.yourAvatar),
        loadImage(line.theirAvatar),
      ])
    : [null, null, null];

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
  let markX = PAD;
  if (mark) {
    ctx.drawImage(mark, PAD, 74, 46, 46);
    markX = PAD + 62;
  }
  ctx.fillStyle = ACCENT;
  ctx.font = `400 32px ${DISPLAY}`;
  ctx.letterSpacing = '7px';
  ctx.textAlign = 'left';
  ctx.fillText('ODDS GODS', markX, 110);
  ctx.letterSpacing = '0px';

  label(ctx, line.eyebrow, W - PAD, 110, 'right');

  // ── the matchup ──────────────────────────────────────────────────────────
  const R = 26;
  const crestY = 206;
  crest(ctx, yourCrest, line.you, PAD + R, crestY, R, true);
  crest(ctx, theirCrest, line.them, W - PAD - R, crestY, R, false);

  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `600 30px ${UI}`;
  ctx.fillText(line.you, PAD + R * 2 + 18, crestY + 11);
  ctx.textAlign = 'right';
  ctx.fillText(line.them, W - PAD - R * 2 - 18, crestY + 11);

  ctx.textAlign = 'left';
  ctx.fillStyle = ACCENT;
  ctx.font = `400 168px ${DISPLAY}`;
  ctx.fillText(line.yourPrice, PAD, 372);

  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.fillText(line.theirPrice, W - PAD, 372);

  // win probability, drawn the way the hub draws it
  const barY = 418;
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
    /* toBlob reports a tainted canvas by throwing, not by returning null. */
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
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
    let blob = await shareCardToBlob(await drawShareCard(line)).catch(() => null);
    if (!blob) {
      /* Most likely a tainted canvas: a logo came from a host that sent no
         CORS headers. Losing one crest beats losing the card. */
      blob = await shareCardToBlob(await drawShareCard(line, { withArt: false }));
    }
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
