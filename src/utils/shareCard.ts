import {
  brandFonts,
  circleImage,
  initialsFor,
  loadImage,
  roundRect,
} from './cardKit';

export interface ShareCardStarter {
  name: string;
  position: string;
  headshotUrl?: string | null;
}

export interface ShareCardLine {
  /** e.g. "Week 8" */
  eyebrow: string;
  /** The league this is all happening in. */
  leagueName?: string | null;
  /** The manager behind the team, when it is not the same string. */
  owner?: string | null;
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
  /** Your starters, in lineup order. The roster is the most personal thing on
      the card and the only part that looks like a team rather than a table.
      
      Empty or absent means the league has not drafted, and the card says so
      rather than leaving a roster-sized hole in its middle. Every caller must
      therefore send the real list when it has one: the anonymous peek reads
      them off the bootstrap it already fetches, because telling somebody who
      drafted in August that their lineup arrives once they draft is a card
      confidently wrong about them in the one place it is most personal. */
  starters?: ShareCardStarter[] | null;
  /** This week, compressed to one line. It is this week's card, but it is
      not this week's story. */
  week?: string | null;
  /** Where you sit, as a pair so the card can set the number apart from the
      field size instead of printing one grey sentence. */
  standing?: { rank: number; of: number } | null;
  /** Every team's title chance, best first. Drawn as a ladder so the standing
      is something you see rather than a sentence you read, which is the
      difference between legible and not at thumbnail size. */
  ladder?: { prob: number; isUser: boolean }[] | null;
  /** The opponent, for the week strip. */
  opponent?: string | null;
  opponentAvatar?: string | null;
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

  const starters = (line.starters ?? []).slice(0, 6);
  const [mark, avatar, oppAvatar, ...faces] = withArt
    ? await Promise.all([
        loadImage('/og-logo.png'),
        loadImage(line.yourAvatar),
        loadImage(line.opponentAvatar),
        ...starters.map((player) => loadImage(player.headshotUrl)),
      ])
    : [null, null, null];

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

  /* Shrink to fit rather than clip. League and team names run long and an
     ellipsis in the places the card names you is worse than a smaller line. */
  const fitted = (text: string, room: number, start: number, weight = 400, family = P.display) => {
    let size = start;
    do {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(text).width <= room) break;
      size -= 2;
    } while (size > 16);
    return size;
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
  /* The league is the context for every number below it, so it rides at the
     top with the week rather than being left off entirely. */
  const context = [line.leagueName, line.eyebrow].filter(Boolean).join('  ·  ');
  label(context, W - PAD, 116, 'right');

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
  const nameX = PAD + R * 2 + 30;
  ctx.font = `400 ${fitted(line.you, W - PAD - nameX, 62)}px ${P.display}`;
  ctx.fillText(line.you, nameX, cy + 2);
  const sub = [line.owner, line.record].filter(Boolean).join('  ·  ');
  if (sub) {
    ctx.fillStyle = P.muted;
    ctx.font = `600 28px ${P.ui}`;
    ctx.fillText(sub, nameX, cy + 44);
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

  /* Your rank was a grey sentence under the fold. It is the one number that
     says whether the price above is good news, so it sits beside it, and the
     field is drawn behind it: a bar per team, yours lit. A number has to be
     read, and at the size these get looked at in a group chat, a shape gets
     through where a number does not. */
  const ladder = line.ladder ?? [];
  if (line.standing) {
    const boxW = 372;
    const boxX = W - PAD - boxW;
    const boxY = 452;
    const boxH = 146;

    /* Right-aligned as one phrase, so it reads "7TH OF 10" and not the other
       way round: the two halves have to be measured before either is drawn. */
    const rankText = ordinal(line.standing.rank);
    const ofText = `OF ${line.standing.of}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = P.faint;
    ctx.font = `700 20px ${P.ui}`;
    ctx.letterSpacing = '2px';
    ctx.fillText(ofText, W - PAD, boxY + 40);
    const ofW = ctx.measureText(ofText).width;
    ctx.letterSpacing = '0px';
    ctx.fillStyle = P.ink;
    ctx.font = `400 54px ${P.display}`;
    ctx.fillText(rankText, W - PAD - ofW - 16, boxY + 40);

    if (ladder.length > 1) {
      const barsTop = boxY + 62;
      const barsH = boxH - 62;
      const gap = 6;
      const barW = Math.max(6, (boxW - gap * (ladder.length - 1)) / ladder.length);
      const peak = Math.max(...ladder.map((row) => row.prob), 1);
      ladder.forEach((row, index) => {
        /* Floored so a long shot is still a mark rather than a gap: a missing
           bar reads as a missing team. */
        const h = Math.max(7, (row.prob / peak) * barsH);
        const x = boxX + (barW + gap) * index;
        ctx.fillStyle = row.isUser ? P.accent : 'rgba(244,245,242,0.20)';
        roundRect(ctx, x, barsTop + barsH - h, barW, h, Math.min(4, barW / 2));
        ctx.fill();
      });
    }
  }

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

  // ── the roster, which is the part that looks like a team ────────────────
  if (starters.length > 0) {
    label('Your starters', PAD, y);
    const top = y + 26;
    const faceR = 52;
    const room = W - PAD * 2;
    const step = room / starters.length;
    starters.forEach((player, index) => {
      const cx = PAD + step * index + step / 2;
      const face = faces[index];
      if (face) circleImage(ctx, face, cx, top + faceR, faceR);
      else {
        ctx.beginPath();
        ctx.arc(cx, top + faceR, faceR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,245,242,0.06)';
        ctx.fill();
        ctx.fillStyle = P.faint;
        ctx.font = `400 34px ${P.display}`;
        ctx.textAlign = 'center';
        ctx.fillText(initialsFor(player.name), cx, top + faceR + 12);
      }
      ctx.strokeStyle = 'rgba(232,84,29,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, top + faceR, faceR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = P.muted;
      ctx.font = `600 20px ${P.ui}`;
      ctx.fillText(lastNameOf(player.name), cx, top + faceR * 2 + 34);
      ctx.fillStyle = P.faint;
      ctx.font = `700 17px ${P.ui}`;
      ctx.fillText(player.position, cx, top + faceR * 2 + 58);
    });
    y = top + faceR * 2 + 96;
  } else {
    /* A league that has not drafted has no lineup to show, and leaving the
       band empty drops a roster-sized hole into the middle of the card. Every
       league is in this state at some point and it is the state a new user
       shares from, so it says what goes there rather than nothing. */
    label('Your starters', PAD, y);
    const top = y + 26;
    const boxH = 176;
    ctx.fillStyle = P.surface;
    roundRect(ctx, PAD, top, W - PAD * 2, boxH, 26);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = P.muted;
    ctx.font = `600 30px ${P.ui}`;
    ctx.fillText('Your lineup lands here once you draft.', W / 2, top + boxH / 2 + 11);
    y = top + boxH + 60;
  }

  // ── this week, as a strip rather than a sentence ─────────────────────────
  if (line.week) {
    const stripH = 92;
    const top = Math.min(y, BAR_TOP - stripH - 34);
    ctx.fillStyle = 'rgba(244,245,242,0.04)';
    roundRect(ctx, PAD, top, W - PAD * 2, stripH, 18);
    ctx.fill();

    label(line.eyebrow, PAD + 26, top + 38);
    ctx.textAlign = 'left';
    ctx.fillStyle = P.ink;
    ctx.font = `600 26px ${P.ui}`;
    ctx.fillText(line.week, PAD + 26, top + 70);

    if (line.opponent) {
      const oppR = 30;
      const oppX = W - PAD - 26 - oppR;
      if (oppAvatar) circleImage(ctx, oppAvatar, oppX, top + stripH / 2, oppR);
      else {
        ctx.beginPath();
        ctx.arc(oppX, top + stripH / 2, oppR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,245,242,0.08)';
        ctx.fill();
        ctx.fillStyle = P.faint;
        ctx.font = `400 26px ${P.display}`;
        ctx.textAlign = 'center';
        ctx.fillText(initialsFor(line.opponent), oppX, top + stripH / 2 + 9);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = P.muted;
      ctx.font = `600 24px ${P.ui}`;
      ctx.fillText(line.opponent, oppX - oppR - 16, top + stripH / 2 + 8);
    }
  }

  // ── the plug, which is the reason the card exists ───────────────────────
  ctx.fillStyle = P.accent;
  ctx.fillRect(0, BAR_TOP, W, H - BAR_TOP);
  ctx.textAlign = 'center';
  ctx.fillStyle = P.bg;
  ctx.font = `400 50px ${P.display}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('PRICE YOUR TEAM FREE AT ODDSGODS.NET', W / 2, BAR_TOP + 70);
  ctx.letterSpacing = '0px';

  return canvas;
}

function ordinal(n: number) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}TH`;
  return `${n}${['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
}

/** "Amon-Ra St. Brown" under a 52px circle needs to be "St. Brown". */
function lastNameOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}
