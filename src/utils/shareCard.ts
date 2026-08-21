import {
  brandFonts,
  circleImage,
  initialsFor,
  loadImage,
  roundRect,
} from './cardKit';

export interface ShareCardLine {
  /** e.g. "Week 8" */
  eyebrow: string;
  /** The user's team. The opponent is deliberately absent: a card about a
      season should not spend a third of itself on one afternoon's opponent. */
  you: string;
  record?: string | null;
  yourAvatar?: string | null;
  /** Already formatted, e.g. "+1226" */
  titleOdds?: string | null;
  playoffs?: string | null;
  finish?: string | null;
  seed?: string | null;
  /** Title chance per recorded week, 0-100, oldest first. Converted upstream
      so the card only ever draws what it is handed. */
  titleSeries?: number[] | null;
  /** This week, compressed to one line. It is this week's card, but it is
      not this week's story. */
  week?: string | null;
  /** Power ranking, e.g. "No. 3 of 12 in the league". */
  standing?: string | null;
}

const W = 1080;
/* Portrait, not square. The season is the subject and it needs the room; every
   chat app previews 4:5 without cropping. */
const H = 1350;
const PAD = 88;
/* A full-bleed accent footer. The card gets forwarded into group chats by
   people who are not us, so the only thing that brings anyone back is the
   address, and it has to survive being a thumbnail. */
const BAR_TOP = H - 108;

export async function drawShareCard(
  line: ShareCardLine,
  { withArt = true }: { withArt?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const P = await brandFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const [mark, avatar] = withArt
    ? await Promise.all([loadImage('/og-logo.png'), loadImage(line.yourAvatar)])
    : [null, null];

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, 0, 620);
  wash.addColorStop(0, 'rgba(232,84,29,0.20)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 620);
  ctx.textBaseline = 'alphabetic';

  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    ctx.fillStyle = P.faint;
    ctx.font = `700 22px ${P.ui}`;
    ctx.letterSpacing = '3px';
    ctx.textAlign = align;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = '0px';
  };

  // ── lockup, matched to the site header: ink, Staatliches, tight ──────────
  let wordX = PAD;
  if (mark) {
    ctx.drawImage(mark, PAD, 54, 96, 96);
    wordX = PAD + 114;
  }
  ctx.fillStyle = P.ink;
  ctx.font = `400 58px ${P.display}`;
  ctx.letterSpacing = '2.9px';
  ctx.textAlign = 'left';
  ctx.fillText('ODDS GODS', wordX, 122);
  ctx.letterSpacing = '0px';
  label(line.eyebrow, W - PAD, 116, 'right');

  // ── who ──────────────────────────────────────────────────────────────────
  const R = 78;
  const cy = 286;
  if (avatar) circleImage(ctx, avatar, PAD + R, cy, R);
  else {
    ctx.beginPath();
    ctx.arc(PAD + R, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,84,29,0.20)';
    ctx.fill();
    ctx.fillStyle = P.accent;
    ctx.font = `400 62px ${P.display}`;
    ctx.textAlign = 'center';
    ctx.fillText(initialsFor(line.you), PAD + R, cy + 23);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  /* Shrink to fit rather than clip. League names run long and an ellipsis in
     the one place the card names you is worse than a smaller line. */
  const nameX = PAD + R * 2 + 30;
  const nameRoom = W - PAD - nameX;
  let nameSize = 62;
  do {
    ctx.font = `400 ${nameSize}px ${P.display}`;
    if (ctx.measureText(line.you).width <= nameRoom) break;
    nameSize -= 2;
  } while (nameSize > 30);
  ctx.fillText(line.you, nameX, cy + 2);
  if (line.record) {
    ctx.fillStyle = P.muted;
    ctx.font = `600 28px ${P.ui}`;
    ctx.fillText(line.record, PAD + R * 2 + 30, cy + 44);
  }

  // ── the season, which is the point ───────────────────────────────────────
  label('Championship odds', PAD, 452);
  ctx.fillStyle = P.accent;
  ctx.font = `400 176px ${P.display}`;
  ctx.textAlign = 'left';
  /* Staatliches sets a bare "1" tight enough that "+1226" reads as "+|226".
     A little tracking is the whole fix. */
  ctx.letterSpacing = '5px';
  ctx.fillText(line.titleOdds ?? 'Not priced', PAD, 596);
  ctx.letterSpacing = '0px';

  const cells = [
    { k: 'Playoffs', v: line.playoffs },
    { k: 'Finish', v: line.finish },
    { k: 'Seed', v: line.seed },
  ].filter((cell) => Boolean(cell.v));

  let y = 652;
  if (cells.length > 0) {
    const boxH = 168;
    ctx.fillStyle = P.surface;
    roundRect(ctx, PAD, y, W - PAD * 2, boxH, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,84,29,0.22)';
    ctx.lineWidth = 2;
    roundRect(ctx, PAD, y, W - PAD * 2, boxH, 26);
    ctx.stroke();
    const colW = (W - PAD * 2) / cells.length;
    cells.forEach((cell, index) => {
      const cx = PAD + colW * index + colW / 2;
      label(cell.k, cx, y + 58, 'center');
      ctx.textAlign = 'center';
      ctx.fillStyle = P.ink;
      ctx.font = `700 54px ${P.num}`;
      ctx.fillText(String(cell.v), cx, y + 124);
    });
    y += boxH + 66;
  }

  // ── how the price has moved ──────────────────────────────────────────────
  const series = line.titleSeries ?? [];
  if (series.length > 1) {
    label('Title chance, week by week', PAD, y);
    /* The endpoints ride the label row rather than sitting under the plot:
       one fewer band of small grey text, and the change is stated instead of
       left to be read off an unlabelled axis. */
    ctx.fillStyle = P.muted;
    ctx.font = `700 24px ${P.num}`;
    ctx.textAlign = 'right';
    ctx.fillText(
      `${series[0].toFixed(1)}% to ${series[series.length - 1].toFixed(1)}%`,
      W - PAD,
      y,
    );
    const top = y + 34;
    const chartH = 168;
    const chartW = W - PAD * 2;
    const lo = Math.min(...series);
    const hi = Math.max(...series);
    const spread = Math.max(hi - lo, 0.5);
    const px = (i: number) => PAD + (chartW * i) / (series.length - 1);
    /* Inset vertically: the marker on the latest week is 9px of radius, and
       at a series high it would otherwise sit half outside the plot. */
    const inset = 14;
    const py = (v: number) =>
      top + chartH - inset - ((v - lo) / spread) * (chartH - inset * 2);

    ctx.strokeStyle = 'rgba(244,245,242,0.08)';
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach((t) => {
      ctx.beginPath();
      ctx.moveTo(PAD, top + chartH * t);
      ctx.lineTo(PAD + chartW, top + chartH * t);
      ctx.stroke();
    });

    // area under the line, so a thin stroke still reads as a shape
    ctx.beginPath();
    ctx.moveTo(px(0), py(series[0]));
    series.forEach((value, index) => ctx.lineTo(px(index), py(value)));
    ctx.lineTo(px(series.length - 1), top + chartH);
    ctx.lineTo(px(0), top + chartH);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, top, 0, top + chartH);
    fill.addColorStop(0, 'rgba(232,84,29,0.32)');
    fill.addColorStop(1, 'rgba(232,84,29,0)');
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    series.forEach((value, index) => {
      const x = px(index);
      const yy = py(value);
      if (index === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    });
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    const lastX = px(series.length - 1);
    const lastY = py(series[series.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 9, 0, Math.PI * 2);
    ctx.fillStyle = P.accent;
    ctx.fill();

    y = top + chartH + 60;
  } else {
    /* Week one has no history, and leaving the band empty drops a hole the
       height of a chart into the middle of the card. Saying why it is empty
       fills the space and tells a new user the card gets better. */
    label('Title chance, week by week', PAD, y);
    const top = y + 34;
    const boxH = 168;
    ctx.fillStyle = P.surface;
    roundRect(ctx, PAD, top, W - PAD * 2, boxH, 26);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = P.muted;
    ctx.font = `600 30px ${P.ui}`;
    ctx.fillText('The line starts moving after week 1.', W / 2, top + boxH / 2 + 11);
    y = top + boxH + 60;
  }

  // ── this week and where they stand, secondary on purpose ────────────────
  const footRows = [line.standing, line.week].filter(Boolean) as string[];
  if (footRows.length > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = P.muted;
    ctx.font = `600 29px ${P.ui}`;
    /* Anchored to the footer bar, not to whatever the chart left behind, so
       these rows keep their clearance whether or not a chart was drawn. */
    let fy = Math.min(y + 12, BAR_TOP - 58 - (footRows.length - 1) * 42);
    footRows.forEach((row) => {
      ctx.fillText(row, PAD, fy);
      fy += 42;
    });
  }

  // ── the plug, which is the reason the card exists ───────────────────────
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, BAR_TOP, W, H - BAR_TOP);
  ctx.textAlign = 'center';
  ctx.fillStyle = P.bg;
  ctx.font = `400 50px ${P.display}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('PRICE YOUR TEAM AT ODDSGODS.NET', W / 2, BAR_TOP + 70);
  ctx.letterSpacing = '0px';

  return canvas;
}
