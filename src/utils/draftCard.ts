import { brandFonts, circleImage, initialsFor, loadImage, roundRect } from './cardKit';

export interface DraftCardPick {
  name: string;
  position: string;
  team?: string | null;
  /** Where he actually went. */
  pickNo: number;
  /** Where our board had him. */
  ourRank: number;
  /** pickNo minus ourRank. Positive is value. */
  delta: number;
  headshotUrl?: string | null;
}

export interface DraftCardData {
  leagueName?: string | null;
  season?: string | null;
  team: string;
  owner?: string | null;
  avatar?: string | null;
  /** Already formatted, e.g. "+1226". */
  titleOdds?: string | null;
  standing?: { rank: number; of: number } | null;
  /** Every team's title chance, best first. */
  ladder?: { prob: number; isUser: boolean }[] | null;
  /** Where the board ranked this haul. */
  haul?: { rank: number; of: number } | null;
  bestValue?: DraftCardPick | null;
  biggestReach?: DraftCardPick | null;
}

const W = 1080;
const H = 1350;
const PAD = 76;
const BAR_TOP = H - 108;

/**
 * Draft Wrapped.
 *
 * The season card answers "where do I stand"; this one answers "what did I just
 * do", and the answer worth sharing is never a leaderboard position. It is two
 * specific picks with faces on them: the one the room let you steal and the one
 * you jumped the board for. Everything else on the card is the frame those two
 * hang in.
 *
 * Both numbers are the same comparison in opposite directions, and they are a
 * comparison against OUR board, not against ADP: there is no average-draft-
 * position feed in this project, so the card cannot say what the fantasy world
 * thought and does not pretend to. What it can say is where we had him, which
 * is the more arguable claim anyway.
 */
export async function drawDraftCard(
  data: DraftCardData,
  { withArt = true }: { withArt?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const P = await brandFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const [mark, avatar, valueFace, reachFace] = withArt
    ? await Promise.all([
        loadImage('/og-logo.png'),
        loadImage(data.avatar),
        loadImage(data.bestValue?.headshotUrl),
        loadImage(data.biggestReach?.headshotUrl),
      ])
    : [null, null, null, null];

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, 0, 600);
  wash.addColorStop(0, 'rgba(232,84,29,0.20)');
  wash.addColorStop(1, 'rgba(232,84,29,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 600);
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
  label([data.leagueName, data.season].filter(Boolean).join('  ·  '), W - PAD, 106, 'right');

  ctx.fillStyle = P.ink;
  ctx.font = `400 96px ${P.display}`;
  ctx.textAlign = 'left';
  ctx.fillText('DRAFT WRAPPED', PAD, 226);

  // ── who ──────────────────────────────────────────────────────────────────
  const R = 44;
  const cy = 300;
  if (avatar) circleImage(ctx, avatar, PAD + R, cy, R);
  else {
    ctx.beginPath();
    ctx.arc(PAD + R, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232,84,29,0.20)';
    ctx.fill();
    ctx.fillStyle = P.accent;
    ctx.font = `400 36px ${P.display}`;
    ctx.textAlign = 'center';
    ctx.fillText(initialsFor(data.team), PAD + R, cy + 13);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = P.ink;
  const teamX = PAD + R * 2 + 22;
  ctx.font = `400 ${fit(data.team, W - PAD - teamX - 240, 46)}px ${P.display}`;
  ctx.fillText(data.team, teamX, cy + 2);
  if (data.owner) {
    ctx.fillStyle = P.muted;
    ctx.font = `600 22px ${P.ui}`;
    ctx.fillText(data.owner, teamX, cy + 32);
  }

  /* Where the board ranked the haul, which is the one whole-draft number that
     is about judgement rather than luck. */
  if (data.haul) {
    ctx.textAlign = 'right';
    ctx.fillStyle = P.accent;
    ctx.font = `400 52px ${P.display}`;
    ctx.fillText(ordinal(data.haul.rank), W - PAD, cy - 6);
    ctx.fillStyle = P.faint;
    ctx.font = `700 18px ${P.ui}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(`BEST HAUL OF ${data.haul.of}`, W - PAD, cy + 24);
    ctx.letterSpacing = '0px';
  }

  // ── the season the draft bought you ──────────────────────────────────────
  label('Championship odds', PAD, 424);
  ctx.fillStyle = P.accent;
  ctx.font = `400 150px ${P.display}`;
  ctx.textAlign = 'left';
  ctx.letterSpacing = '4px';
  ctx.fillText(data.titleOdds ?? 'Not priced', PAD, 546);
  ctx.letterSpacing = '0px';

  const ladder = data.ladder ?? [];
  if (data.standing) {
    const rankText = ordinal(data.standing.rank);
    const ofText = `OF ${data.standing.of}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = P.faint;
    ctx.font = `700 20px ${P.ui}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(ofText, W - PAD, 442);
    const ofW = ctx.measureText(ofText).width;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = P.ink;
    ctx.font = `400 50px ${P.display}`;
    ctx.fillText(rankText, W - PAD - ofW - 14, 442);

    if (ladder.length > 1) {
      const boxW = 340;
      const boxX = W - PAD - boxW;
      const top = 462;
      const barsH = 84;
      const gap = 6;
      const barW = Math.max(6, (boxW - gap * (ladder.length - 1)) / ladder.length);
      const peak = Math.max(...ladder.map((row) => row.prob), 1);
      ladder.forEach((row, index) => {
        const h = Math.max(7, (row.prob / peak) * barsH);
        ctx.fillStyle = row.isUser ? P.accent : 'rgba(244,245,242,0.20)';
        roundRect(ctx, boxX + (barW + gap) * index, top + barsH - h, barW, h, Math.min(4, barW / 2));
        ctx.fill();
      });
    }
  }

  // ── the two picks, which are the point ───────────────────────────────────
  const cardTop = 620;
  const cardH = BAR_TOP - 44 - cardTop;
  const colW = (W - PAD * 2 - 36) / 2;

  const drawPick = (
    pick: DraftCardPick | null | undefined,
    face: HTMLImageElement | null,
    index: number,
    heading: string,
    good: boolean,
  ) => {
    const x = PAD + (colW + 36) * index;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = good ? 'rgba(58,210,159,0.08)' : 'rgba(255,107,87,0.07)';
    roundRect(ctx, x, cardTop, colW, cardH, 28);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = good ? 'rgba(58,210,159,0.34)' : 'rgba(255,107,87,0.30)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, cardTop, colW, cardH, 28);
    ctx.stroke();

    const cx = x + colW / 2;
    label(heading, cx, cardTop + 48, 'center');
    if (!pick) {
      ctx.textAlign = 'center';
      ctx.fillStyle = P.faint;
      ctx.font = `600 24px ${P.ui}`;
      ctx.fillText('Not enough priced picks', cx, cardTop + cardH / 2);
      return;
    }

    const faceR = 96;
    const faceY = cardTop + 88 + faceR;
    if (face) circleImage(ctx, face, cx, faceY, faceR);
    else {
      ctx.beginPath();
      ctx.arc(cx, faceY, faceR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,245,242,0.07)';
      ctx.fill();
      ctx.fillStyle = P.faint;
      ctx.font = `400 64px ${P.display}`;
      ctx.textAlign = 'center';
      ctx.fillText(initialsFor(pick.name), cx, faceY + 22);
    }
    ctx.strokeStyle = good ? 'rgba(58,210,159,0.55)' : 'rgba(255,107,87,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, faceY, faceR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = P.ink;
    ctx.font = `400 ${fit(pick.name, colW - 30, 44)}px ${P.display}`;
    ctx.fillText(pick.name, cx, faceY + faceR + 48);
    ctx.fillStyle = P.faint;
    ctx.font = `700 18px ${P.ui}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(
      [pick.position, pick.team].filter(Boolean).join(' · ').toUpperCase(),
      cx,
      faceY + faceR + 76,
    );
    ctx.letterSpacing = '0px';

    /* The whole claim in one line: where he went against where we had him. */
    ctx.fillStyle = P.muted;
    ctx.font = `600 24px ${P.ui}`;
    ctx.fillText(`Went ${pick.pickNo} · we had him ${ordinal(pick.ourRank)}`, cx, faceY + faceR + 118);
    ctx.fillStyle = good ? P.green : P.red;
    ctx.font = `700 46px ${P.num}`;
    ctx.fillText(
      `${pick.delta > 0 ? '+' : ''}${pick.delta}`,
      cx,
      faceY + faceR + 176,
    );
    ctx.fillStyle = P.faint;
    ctx.font = `700 16px ${P.ui}`;
    ctx.letterSpacing = '2px';
    ctx.fillText('SLOTS', cx, faceY + faceR + 200);
    ctx.letterSpacing = '0px';
  };

  drawPick(data.bestValue, valueFace, 0, 'Your steal', true);
  drawPick(data.biggestReach, reachFace, 1, 'Your reach', false);

  // ── the plug ─────────────────────────────────────────────────────────────
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, BAR_TOP, W, H - BAR_TOP);
  ctx.textAlign = 'center';
  ctx.fillStyle = P.bg;
  ctx.font = `400 50px ${P.display}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('GRADE YOUR DRAFT AT ODDSGODS.NET', W / 2, BAR_TOP + 70);
  ctx.letterSpacing = '0px';

  return canvas;
}

function ordinal(n: number) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}TH`;
  return `${n}${['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
}
