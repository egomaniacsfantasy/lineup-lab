import {
  brandFonts,
  circleImage,
  initialsFor,
  loadImage,
  roundRect,
  type Palette,
} from './cardKit';

export interface TradeCardAsset {
  name: string;
  position: string;
  team?: string | null;
  headshotUrl?: string | null;
}

export interface TradeCardProposal {
  /** e.g. "Week 1" */
  eyebrow: string;
  you: string;
  them: string;
  yourAvatar?: string | null;
  theirAvatar?: string | null;
  send: TradeCardAsset[];
  get: TradeCardAsset[];
  /** Already formatted, e.g. "+2.1%" */
  titleDelta: string;
  titleUp: boolean;
  /** Already formatted, e.g. "57%" */
  acceptance?: string | null;
  /** e.g. "Likely to accept" */
  acceptanceBand?: string | null;
  verdict?: string | null;
}

const W = 1080;
const H = 1080;
const PAD = 88;

/**
 * A trade proposal, as a thing you can put in the group chat.
 *
 * This is the argument, not the summary: two rosters' worth of faces, what it
 * does to your title price, and how likely they are to say yes. The point is
 * that a proposal is a negotiation, so the card has to be readable by the
 * person being asked, not just the person asking.
 *
 * Boundary: every number here is already on screen. It formats and paints.
 */
export async function drawTradeCard(
  deal: TradeCardProposal,
  { withArt = true }: { withArt?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const P: Palette = await brandFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const faces = withArt
    ? await Promise.all(
        [...deal.send, ...deal.get].map((asset) => loadImage(asset.headshotUrl)),
      )
    : [];
  const [mark, yourCrest, theirCrest] = withArt
    ? await Promise.all([
        loadImage('/og-logo.png'),
        loadImage(deal.yourAvatar),
        loadImage(deal.theirAvatar),
      ])
    : [null, null, null];

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);

  const wash = ctx.createLinearGradient(0, 0, 0, 420);
  wash.addColorStop(0, 'rgba(232,84,29,0.16)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 420);
  ctx.textBaseline = 'alphabetic';

  // ── mark ─────────────────────────────────────────────────────────────────
  let markX = PAD;
  if (mark) {
    ctx.drawImage(mark, PAD, 74, 46, 46);
    markX = PAD + 62;
  }
  ctx.fillStyle = P.accent;
  ctx.font = `400 32px ${P.display}`;
  ctx.letterSpacing = '7px';
  ctx.textAlign = 'left';
  ctx.fillText('ODDS GODS', markX, 110);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = P.faint;
  ctx.font = `700 21px ${P.ui}`;
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'right';
  ctx.fillText(deal.eyebrow.toUpperCase(), W - PAD, 110);
  ctx.letterSpacing = '0px';

  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  ctx.font = `400 76px ${P.display}`;
  ctx.fillText('TRADE PROPOSAL', PAD, 196);

  /* One side of the deal: the manager, then their faces, then the names. The
     side you give sits above the side you get, because that is the order the
     sentence is said in. */
  const side = (
    label: string,
    manager: string,
    crestImg: HTMLImageElement | null,
    assets: TradeCardAsset[],
    faceOffset: number,
    top: number,
    accent: boolean,
  ) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = P.faint;
    ctx.font = `700 20px ${P.ui}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(label.toUpperCase(), PAD, top);
    ctx.letterSpacing = '0px';

    const R = 20;
    const cx = W - PAD - R;
    if (crestImg) circleImage(ctx, crestImg, cx, top - 8, R);
    else {
      ctx.beginPath();
      ctx.arc(cx, top - 8, R, 0, Math.PI * 2);
      ctx.fillStyle = accent ? 'rgba(232,84,29,0.22)' : 'rgba(244,245,242,0.10)';
      ctx.fill();
      ctx.fillStyle = accent ? P.accent : P.muted;
      ctx.font = `400 20px ${P.display}`;
      ctx.textAlign = 'center';
      ctx.fillText(initialsFor(manager), cx, top - 1);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = P.muted;
    ctx.font = `600 24px ${P.ui}`;
    ctx.fillText(manager, W - PAD - R * 2 - 14, top);

    // faces
    const faceR = 44;
    let x = PAD + faceR;
    assets.forEach((asset, index) => {
      const img = faces[faceOffset + index] ?? null;
      if (img) circleImage(ctx, img, x, top + 74, faceR);
      else {
        ctx.beginPath();
        ctx.arc(x, top + 74, faceR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,245,242,0.09)';
        ctx.fill();
        ctx.fillStyle = P.muted;
        ctx.font = `400 34px ${P.display}`;
        ctx.textAlign = 'center';
        ctx.fillText(initialsFor(asset.name), x, top + 86);
      }
      x += faceR * 2 + 12;
    });

    // names, wrapped onto one line each under the faces
    ctx.textAlign = 'left';
    ctx.fillStyle = P.ink;
    ctx.font = `600 25px ${P.ui}`;
    const names = assets.map((a) => a.name).join('   ·   ');
    ctx.fillText(names, PAD, top + 158);
  };

  side('You send', deal.you, yourCrest, deal.send, 0, 296, true);

  // the swap mark between the two halves
  ctx.textAlign = 'center';
  ctx.fillStyle = P.accent;
  ctx.font = `400 46px ${P.ui}`;
  ctx.fillText('⇄', W / 2, 540);

  side('You get', deal.them, theirCrest, deal.get, deal.send.length, 616, false);

  // ── the read ─────────────────────────────────────────────────────────────
  const boxTop = 850;
  ctx.fillStyle = P.surface;
  roundRect(ctx, PAD, boxTop, W - PAD * 2, 130, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,84,29,0.22)';
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, boxTop, W - PAD * 2, 130, 26);
  ctx.stroke();

  const cells: { k: string; v: string; tone?: string }[] = [
    { k: 'Your title', v: deal.titleDelta, tone: deal.titleUp ? P.green : P.red },
  ];
  if (deal.acceptance) cells.push({ k: 'They accept', v: deal.acceptance });
  if (deal.verdict) cells.push({ k: 'Read', v: deal.verdict });

  const colW = (W - PAD * 2) / cells.length;
  cells.forEach((cell, index) => {
    const cx = PAD + colW * index + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = P.faint;
    ctx.font = `700 19px ${P.ui}`;
    ctx.letterSpacing = '3px';
    ctx.fillText(cell.k.toUpperCase(), cx, boxTop + 46);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = cell.tone ?? P.ink;
    ctx.font = `700 44px ${P.num}`;
    ctx.fillText(cell.v, cx, boxTop + 100);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(244,245,242,0.22)';
  ctx.font = `600 25px ${P.ui}`;
  ctx.fillText('oddsgods.net', PAD, H - 40);

  return canvas;
}
