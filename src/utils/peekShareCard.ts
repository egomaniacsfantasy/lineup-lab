import { formatProbOrOdds } from './formatOdds';
import type { ShareCardLine } from './shareCard';
import type { PeekLeague } from '../hooks/usePeek';
import { apiUrl, resolveApiUrl } from '../services/apiBase';

/**
 * The anonymous peek, as the Hub's card.
 *
 * Not a second card. The same generator the Hub uses, handed the same shape,
 * because the person most likely to send one is somebody who just watched
 * their own number appear and has not committed to anything yet. A card that
 * looked different from the product's real card would be a worse advert for it
 * and a second thing to keep in step.
 *
 * What the peek cannot fill: starters, playoff odds, projected finish and
 * average seed. Those come off the roster and the futures row, and the peek
 * reads neither. They are all optional on the card, which draws what it is
 * given rather than leaving holes, so the peek's version is the same card with
 * fewer facts on it.
 */
export function peekShareCard(league: PeekLeague): ShareCardLine {
  const ranked = [league.you, ...league.others].sort((a, b) => b.titleProb - a.titleProb);
  const rank = ranked.findIndex((row) => row.isUser) + 1;
  const game = league.matchup;

  return {
    eyebrow: game ? `Week ${game.week}` : 'The book',
    leagueName: league.name,
    you: league.you.teamName,
    record: game?.you.record ?? null,
    yourAvatar: resolveApiUrl(league.you.avatarUrl ?? undefined) ?? null,
    titleOdds: formatProbOrOdds(league.you.titleProb),
    /* The other three the card draws beside the title price. All were already
       on the futures row the peek fetches, and dropping them left the card
       with a roster-sized hole where the Hub's version has numbers. */
    playoffs:
      league.you.playoffProb != null ? `${Math.round(league.you.playoffProb)}%` : null,
    finish: league.you.projRecord,
    seed: league.you.avgSeed != null ? league.you.avgSeed.toFixed(1) : null,
    /* Real faces, off the bootstrap the peek already reads.
    
       This matters more than it looks. An empty list is the card's way of
       saying the league has not drafted, and the peek used to send one always,
       so anybody sharing from the landing page got a card telling them their
       lineup arrives once they draft, in August, under their own team name. */
    starters: league.starters
      ? league.starters.map((player) => ({
          name: player.name,
          position: player.position,
          headshotUrl: apiUrl(`/api/img/headshot/${player.playerId}`),
        }))
      : [],
    standing: rank > 0 ? { rank, of: ranked.length } : null,
    /* Every team's chance, best first, so where they sit is something you see
       rather than a sentence you read. Locked on screen, drawn here: the card
       is theirs to send, and withholding the shape of their own league from
       their own card would be withholding it from nobody. */
    ladder: ranked.map((row) => ({ prob: row.titleProb, isUser: row.isUser })),
    week: game
      ? `${formatProbOrOdds(game.you.winProbability)} to win this week`
      : null,
    opponent: game?.them.teamName ?? null,
    opponentAvatar: resolveApiUrl(game?.them.avatarUrl ?? undefined) ?? null,
  };
}
