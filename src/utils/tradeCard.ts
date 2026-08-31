import {
  brandFonts,
  circleImage,
  initialsFor,
  loadImage,
  roundRect,
} from './cardKit';

export interface TradeCardAsset {
  name: string;
  position: string;
  team?: string | null;
  headshotUrl?: string | null;
}

export interface TradeCardSide {
  manager: string;
  avatar?: string | null;
  assets: TradeCardAsset[];
  /** Already formatted and signed, e.g. "+0.2%". */
  titleDelta: string;
  playoffDelta: string;
  titleUp: boolean;
  playoffUp: boolean;
}

export interface TradeCardProposal {
  /** e.g. "Week 1" */
  eyebrow: string;
  leagueName?: string | null;
  /** The engine's read on balance: "Fair deal", "Overpay", "Steal". */
  verdict?: string | null;
  you: TradeCardSide;
  them: TradeCardSide;
}

const W = 1080;
const H = 1350;
const PAD = 76;
const BAR_TOP = H - 108;

/**
 * The trade, as something you would actually post in the group chat.
 *
 * The old card was a proposal slip: small faces, one side's title delta, and
 * an acceptance percentage. Acceptance is a private read, and putting it on a
 * card you hand to the other manager is showing him your hand. So it is gone.
 *
 * What is left is the argument: who is trading, the players at a size where
 * you can see their faces, and what the deal does to BOTH teams. A trade card
 * that only shows your own gain is a card nobody sends.
 */
export async function drawTradeCard(
  deal: TradeCardProposal,
  { withArt = true }: { withArt?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const P = await brandFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const sides = [deal.you, deal.them];
  const [mark, ...art] = withArt
    ? await Promise.all([
        loadImage('/og-logo.png'),
        ...sides.flatMap((side) => [
          loadImage(side.avatar),
          ...side.assets.slice(0, 3).map((asset) => loadImage(asset.headshotUrl)),
        ]),
      ])
    : [null];

  /* Walk the same flattened order the loads were queued in. */
  let cursor = 0;
  const artFor = sides.map((side) => {
    const avatar = art[cursor++] ?? null;
    const faces = side.assets.slice(0, 3).map(() => art[cursor++] ?? null);
    return { avatar, faces };
  });

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, 0, 560);
  wash.addColorStop(0, 'rgba(232,84,29,0.18)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 560);
  ctx.textBaseline = 'alphabetic';

  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
    ctx.fillStyle = P.faint;
    ctx.font = `700 21px ${P.ui}`;
    ctx.letterSpacing = '3px';
    ctx.textAlign = align;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = '0px';
  };

  const fit = (text: string, room: number, start: number, family = P.display, weight = 400) => {
    let size = start;
    do {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(text).width <= room) break;
      size -= 2;
    } while (size > 14);
    return size;
  };

  // ── lockup ───────────────────────────────────────────────────────────────
  let wordX = PAD;
  if (mark) {
    ctx.drawImage(mark, PAD, 50, 84, 84);
    wordX = PAD + 102;
  }
  ctx.fillStyle = P.ink;
  ctx.font = `400 52px ${P.display}`;
  ctx.letterSpacing = '2.6px';
  ctx.textAlign = 'left';
  ctx.fillText('ODDS GODS', wordX, 112);
  ctx.letterSpacing = '0px';
  label([deal.leagueName, deal.eyebrow].filter(Boolean).join('  ·  '), W - PAD, 106, 'right');

  /* The headline is a caption on the deal, not the deal itself. It was set at
     128px, which made a one-word read like "FAIR" the loudest thing on a card
     whose subject is two rosters changing hands. */
  if (deal.verdict) {
    ctx.fillStyle = P.ink;
    ctx.font = `400 ${fit(deal.verdict.toUpperCase(), W - PAD * 2, 82)}px ${P.display}`;
    ctx.textAlign = 'left';
    ctx.fillText(deal.verdict.toUpperCase(), PAD, 232);
  }

  // ── the two sides ────────────────────────────────────────────────────────
  const colW = (W - PAD * 2 - 44) / 2;
  const top = 282;
  /* The stat rows sit just above the plug, and the panels take everything
     between. A fixed panel height left a one-for-one deal with a third of the
     card empty; sizing the faces to the room instead means a small deal reads
     as a portrait and a three-for-three still fits. */
  const statTop = BAR_TOP - 116;
  const cardH = statTop - 44 - top;
  const HEAD = 140;
  const count = Math.max(
    1,
    Math.min(3, Math.max(deal.you.assets.length, deal.them.assets.length)),
  );
  /* Names and positions were sitting 72px under a circle and immediately under
     the next one, so a two-for-two had its players stacked shoulder to
     shoulder with nothing between them. The caption gets real room and the
     rows get a gap; three-a-side tightens because it has to. */
  const CAPTION = count >= 3 ? 74 : 100;
  const GAP = count >= 3 ? 10 : 22;
  const faceR = Math.max(
    42,
    Math.min(128, ((cardH - HEAD) / count - CAPTION - GAP) / 2),
  );
  const rowH = faceR * 2 + CAPTION + GAP;
  /* Centre the stack: two players against three should not hang off the top. */
  const stackTop = top + HEAD + Math.max(0, (cardH - HEAD - rowH * count) / 2);

  sides.forEach((side, index) => {
    const x = PAD + (colW + 44) * index;
    const cx = x + colW / 2;

    /* Coloured by outcome, not by whose column it is.

       The panels were amber for you and grey for them, which says who is
       reading the card rather than anything about the trade. The card's whole
       argument is what the deal does to both teams, and it was making that
       argument only in two small figures under the panels while the panels
       themselves stayed neutral. The side that gains is edged green now and
       the side that gives up ground is edged red, so the argument survives
       being glanced at in a group chat. */
    const gains = side.titleUp;
    const edge = gains ? 'rgba(52,210,123,0.55)' : 'rgba(255,92,77,0.5)';
    const wash = gains ? 'rgba(52,210,123,0.09)' : 'rgba(255,92,77,0.08)';

    /* Lifted off the background rather than drawn into it, so the two sides
       read as two objects on a table. */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = wash;
    roundRect(ctx, x, top, colW, cardH, 30);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, top, colW, cardH, 30);
    ctx.stroke();

    // manager
    const mR = 26;
    const managerSize = fit(side.manager, colW - 56 - mR * 2, 30, P.ui, 700);
    ctx.font = `700 ${managerSize}px ${P.ui}`;
    const managerW = ctx.measureText(side.manager).width;
    const blockW = mR * 2 + 12 + managerW;
    const mX = cx - blockW / 2 + mR;
    const avatar = artFor[index].avatar;
    if (avatar) circleImage(ctx, avatar, mX, top + 52, mR);
    else {
      ctx.beginPath();
      ctx.arc(mX, top + 52, mR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,245,242,0.10)';
      ctx.fill();
      ctx.fillStyle = P.faint;
      ctx.font = `400 22px ${P.display}`;
      ctx.textAlign = 'center';
      ctx.fillText(initialsFor(side.manager), mX, top + 60);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = P.ink;
    ctx.font = `700 ${managerSize}px ${P.ui}`;
    ctx.fillText(side.manager, mX + mR + 12, top + 61);

    label('Gets', cx, top + 108, 'center');

    /* Headshots are the point of the card, so they get the room. One player
       gets a portrait; three still clear 62px of radius, which is the size
       below which a face stops being recognisable at thumbnail scale. */
    const assets = side.assets.slice(0, 3);
    /* Every column uses the same radius even when the sides are lopsided, so
       a two-for-one does not make one manager's player look more important
       than the other's. */
    assets.forEach((asset, i) => {
      const fy = stackTop + faceR + rowH * i;
      const face = artFor[index].faces[i];
      if (face) circleImage(ctx, face, cx, fy, faceR);
      else {
        ctx.beginPath();
        ctx.arc(cx, fy, faceR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,245,242,0.07)';
        ctx.fill();
        ctx.fillStyle = P.faint;
        ctx.font = `400 ${faceR * 0.7}px ${P.display}`;
        ctx.textAlign = 'center';
        ctx.fillText(initialsFor(asset.name), cx, fy + faceR * 0.24);
      }
      ctx.strokeStyle = edge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, fy, faceR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = P.ink;
      ctx.font = `400 ${fit(asset.name, colW - 32, count === 1 ? 46 : count === 2 ? 38 : 32)}px ${P.display}`;
      ctx.fillText(asset.name, cx, fy + faceR + 42);
      ctx.fillStyle = P.faint;
      ctx.font = `700 19px ${P.ui}`;
      ctx.letterSpacing = '2px';
      ctx.fillText(
        [asset.position, asset.team].filter(Boolean).join(' · ').toUpperCase(),
        cx,
        fy + faceR + 68,
      );
      ctx.letterSpacing = '0px';
    });
  });

  /* Centred on the panels rather than on the first row of faces, and drawn
     last so it sits over the seam between them. It was pinned to the top face,
     which put it near the shoulders of a two-for-two and nowhere near the
     middle of the deal. */
  const swapY = top + cardH / 2;
  const swapR = 58;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.arc(W / 2, swapY, swapR, 0, Math.PI * 2);
  ctx.fillStyle = P.bg;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(W / 2, swapY, swapR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(232,84,29,0.55)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = P.accent;
  ctx.font = `400 66px ${P.ui}`;
  ctx.fillText('⇄', W / 2, swapY + 22);

  // ── what it does to both teams, which is the whole argument ─────────────
  sides.forEach((side, index) => {
    const x = PAD + (colW + 44) * index;
    const rows = [
      { k: 'Championship', v: side.titleDelta, up: side.titleUp },
      { k: 'Playoffs', v: side.playoffDelta, up: side.playoffUp },
    ];
    rows.forEach((row, i) => {
      const ry = statTop + i * 52;
      ctx.textAlign = 'left';
      ctx.fillStyle = P.muted;
      ctx.font = `600 24px ${P.ui}`;
      ctx.fillText(row.k, x + 4, ry);
      ctx.textAlign = 'right';
      ctx.fillStyle = row.up ? P.green : P.red;
      ctx.font = `700 30px ${P.num}`;
      ctx.fillText(row.v, x + colW - 4, ry);
    });
  });

  // ── the plug ─────────────────────────────────────────────────────────────
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, BAR_TOP, W, H - BAR_TOP);
  ctx.textAlign = 'center';
  ctx.fillStyle = P.bg;
  ctx.font = `400 50px ${P.display}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('PRICE YOUR TRADES FREE AT ODDSGODS.NET', W / 2, BAR_TOP + 70);
  ctx.letterSpacing = '0px';

  return canvas;
}
