/**
 * Shared drawing kit for exportable cards.
 *
 * Two cards now paint the same brand: the same palette, the same fonts, the
 * same circular crest with an initials fallback, the same rounded panel. The
 * second card copying the first is how the two quietly drift apart, so the
 * pieces both need live here once.
 */

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  amber: string;
  green: string;
  red: string;
  display: string;
  ui: string;
  num: string;
}

export const PALETTE: Palette = {
  bg: '#0d0f11',
  surface: '#16120f',
  ink: '#f4f5f2',
  muted: 'rgba(244,245,242,0.52)',
  faint: 'rgba(244,245,242,0.34)',
  accent: '#ff8049',
  amber: '#e8541d',
  green: '#3ad29f',
  red: '#ff6b57',
  display: 'Staatliches, "Arial Narrow", sans-serif',
  ui: '"Hanken Grotesk", system-ui, sans-serif',
  num: '"JetBrains Mono", ui-monospace, monospace',
};

/**
 * A canvas paints whatever is loaded when it draws, so a card built before the
 * webfonts arrive silently falls back to system type. document.fonts.load
 * resolves when a face is usable, so the card waits and then looks like the
 * product.
 */
export async function brandFonts(): Promise<Palette> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.load) {
    try {
      await Promise.all([
        fonts.load('400 190px Staatliches'),
        fonts.load('600 34px "Hanken Grotesk"'),
        fonts.load('700 34px "Hanken Grotesk"'),
        fonts.load('700 54px "JetBrains Mono"'),
      ]);
      await fonts.ready;
    } catch {
      // A missing face is not a reason to refuse to draw.
    }
  }
  return PALETTE;
}

/**
 * Load an image for the canvas, or give up quietly.
 *
 * crossOrigin is set because these cards are exported with toBlob, and a
 * canvas that has drawn a cross-origin image without CORS is tainted: the
 * export then throws and the whole card is lost rather than one headshot.
 */
export function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
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

export function circleImage(
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
  /* Headshots are cutouts with the head at the top, so bias upward the same
     way the app's CSS does with object-position: top center.
     Clamped, because the bias only has room to move when the source is taller
     than the circle. A square source (every manager avatar) scales to exactly
     the diameter, so an unclamped 0.47 offset left an uncovered crescent at
     the top of the circle and read as the picture being cut off. */
  const top = Math.min(cy - r, cy - h * 0.47);
  ctx.drawImage(img, cx - w / 2, top, w, h);
  ctx.restore();
}

export function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function roundRect(
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

/** toBlob reports a tainted canvas by throwing, not by returning null. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
