import { brandFonts, circleImage, initialsFor, loadImage, roundRect } from './cardKit';
import { MARKET_LABEL, type ParlayLeg } from './parlay';

/**
 * The parlay, as a picture.
 *
 * A sportsbook slip is a list with a number on top, and the number is the
 * reason anyone screenshots it. So the price is the hero here rather than a
 * caption beside a title: it is set at four times the size of any other text
 * on the card, in the face the product sets prices in.
 *
 * What is deliberately NOT on it: no scores, no won or lost, no status pill,
 * and no money. This card is made before the games, not after them, and the
 * claim it carries is "here is what I took and here is what it is worth".
 *
 * ────────────────────────────────────────────────────────────────────────
 * HEIGHT IS COMPUTED, NOT CHOSEN
 *
 * Every other card in the product is 1080x1350, because every other card
 * carries a fixed set of facts. A parlay does not: a single is one row and a
 * league-wide slip can be eighteen, and either a tall card wastes most of
 * itself on a single or a short one drops legs. So the height is the sum of
 * the parts and the footer is pinned to the bottom of whatever that comes to.
 *
 * The consequence to keep in mind when editing: nothing may be positioned
 * from a constant measured off the bottom except the footer itself.
 */

export interface ParlayCardLine {
  /** e.g. "Week 8" */
  eyebrow: string;
  leagueName?: string | null;
  /** Whose slip it is. */
  you?: string | null;
  legs: ParlayLeg[];
  /** Already formatted, e.g. "+900". Formatting belongs to the odds toggle. */
  price: string;
}

const W = 1080;
const PAD = 88;
/* The plug bar, the same height and colour as every other card's. It is the
   only reason a card that gets forwarded twice brings anyone back. */
const BAR = 108;
/* One leg: a panel and the gap under it. */
const PANEL = 100;
const GAP = 14;
const ROW = PANEL + GAP;

/** Where the legs start. Everything above this is fixed-height. */
const LEGS_TOP = 470;

/** The exact height this slip needs. Exported so a guard can check it. */
export function parlayCardHeight(legCount: number): number {
  return LEGS_TOP + Math.max(0, legCount) * ROW + 26 + BAR;
}

export async function drawParlayCard(
  line: ParlayCardLine,
  { withArt = true }: { withArt?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const P = await brandFonts();
  const legs = line.legs;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = parlayCardHeight(legs.length);
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const [mark, ...crests] = withArt
    ? await Promise.all([loadImage('/og-logo.png'), ...legs.map((leg) => loadImage(leg.avatarUrl))])
    : [null, ...legs.map(() => null)];

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  /* The wash sits behind the price and stops before the legs start, so the
     hero has weight without the list reading as a different card. */
  const wash = ctx.createLinearGradient(0, 0, 0, LEGS_TOP);
  wash.addColorStop(0, 'rgba(232,84,29,0.24)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, LEGS_TOP);
  ctx.textBaseline = 'alphabetic';

  const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'left', color = P.faint) => {
    ctx.fillStyle = color;
    ctx.font = `700 22px ${P.ui}`;
    ctx.letterSpacing = '3px';
    ctx.textAlign = align;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = '0px';
  };

  /* Shrink rather than clip. Team names run long and every one of them is
     somebody's, so an ellipsis through one is worse than a smaller line. */
  const fitted = (text: string, room: number, start: number, weight = 400, family = P.display) => {
    let size = start;
    do {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(text).width <= room) break;
      size -= 2;
    } while (size > 14);
    return size;
  };

  // ── lockup, matched to every other card ─────────────────────────────────
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
  label([line.leagueName, line.eyebrow].filter(Boolean).join('  ·  '), W - PAD, 116, 'right');

  // ── the price, which is the whole card ──────────────────────────────────
  /* Whose slip, and how long, on one line above the number. The team name
     used to float on the right of the price, where it read as a fourth leg
     and, in a slip containing that team, printed the same name twice. */
  const legWord = legs.length === 1 ? 'PICK' : 'LEGS';
  const eyebrow = [line.you, `${legs.length} ${legWord}`].filter(Boolean).join('  ·  ');
  label(eyebrow, PAD, 232, 'left', P.accent);

  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  const priceSize = fitted(line.price, W - PAD * 2, 210);
  ctx.font = `400 ${priceSize}px ${P.display}`;
  ctx.fillText(line.price, PAD, 380);

  /* The claim under the number. Every book quotes this parlay shorter than
     we do, and the reason is the only thing separating the two prices. */
  label('Fair odds, no cut taken', PAD, 428, 'left', P.muted);

  // ── the legs ────────────────────────────────────────────────────────────
  legs.forEach((leg, index) => {
    const top = LEGS_TOP + index * ROW;
    const mid = top + PANEL / 2;

    /* A lift off the page, not the palette's surface colour. P.surface is
       #16120f against a #0d0f11 background: nine points of red and three of
       everything else, which is a panel you cannot see. Twenty of those read
       as one undifferentiated block of text rather than a list of picks. */
    ctx.fillStyle = 'rgba(244,245,242,0.075)';
    roundRect(ctx, PAD, top, W - PAD * 2, PANEL, 20);
    ctx.fill();

    const R = 30;
    const cx = PAD + 30 + R;
    const crest = crests[index];
    if (crest) circleImage(ctx, crest, cx, mid, R);
    else {
      ctx.beginPath();
      ctx.arc(cx, mid, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,84,29,0.18)';
      ctx.fill();
      ctx.fillStyle = P.accent;
      ctx.font = `400 28px ${P.display}`;
      ctx.textAlign = 'center';
      /* Totals belong to the game rather than to either side, so they get
         the O or the U instead of a crest that would name the wrong team. */
      ctx.fillText(
        leg.market === 'total' ? leg.label.slice(0, 1).toUpperCase() : initialsFor(leg.label),
        cx,
        mid + 10,
      );
    }

    // the price, first, because the text has to be told where to stop
    ctx.textAlign = 'right';
    ctx.fillStyle = P.ink;
    ctx.font = `400 46px ${P.display}`;
    const priceX = W - PAD - 30;
    const priceRoom = ctx.measureText(leg.price >= 0 ? `+${leg.price}` : `${leg.price}`).width;
    ctx.fillText(leg.price >= 0 ? `+${leg.price}` : `${leg.price}`, priceX, mid + 8);

    const textX = cx + R + 26;
    const room = priceX - priceRoom - 28 - textX;

    /* Pick and line as one string so they shrink together: "SONIC -2.9"
       split across two sizes reads as two different facts. */
    const pick = leg.line ? `${leg.label} ${leg.line}` : leg.label;
    ctx.textAlign = 'left';
    const pickSize = fitted(pick, room, 36, 700, P.ui);
    ctx.font = `700 ${pickSize}px ${P.ui}`;
    ctx.fillStyle = P.ink;
    ctx.fillText(pick, textX, mid - 4);

    /* "Moneyline · vs Adam's Astounding Team", not the whole fixture: the
       pick above already names one side, and two legs from one game would
       otherwise carry the identical line twice. A total belongs to neither
       side, so that one keeps the fixture. */
    const context = leg.opponent ? `vs ${leg.opponent}` : leg.matchupLabel;
    const meta = `${MARKET_LABEL[leg.market]} · ${context}`;
    const metaSize = fitted(meta, room, 22, 500, P.ui);
    ctx.font = `500 ${metaSize}px ${P.ui}`;
    ctx.fillStyle = P.faint;
    ctx.fillText(meta, textX, mid + 30);
  });

  // ── the plug, pinned to the bottom of whatever height this came to ──────
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, H - BAR, W, BAR);
  ctx.textAlign = 'center';
  ctx.fillStyle = P.bg;
  ctx.font = `400 50px ${P.display}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('PRICE YOUR TEAM AT ODDSGODS.NET', W / 2, H - BAR + 70);
  ctx.letterSpacing = '0px';

  return canvas;
}
