/**
 * The line that travels with the card.
 *
 * A card lands in a group chat as a silent image. The message is what gives
 * whoever posted it something to say, and it is the only part of the share
 * that survives being pasted into a text box with no image attached.
 *
 * Two rules. It never says anything the card does not already show, because a
 * caption that contradicts the picture is worse than no caption. And it reads
 * like the manager wrote it, not like the product did: it is posted under
 * their name, and ad copy in someone else's mouth is the fastest way to make
 * them delete it.
 */

export interface HubShareFacts {
  team: string;
  leagueName?: string | null;
  titleOdds?: string | null;
  rank?: number | null;
  of?: number | null;
}

export interface TradeShareFacts {
  you: string;
  them: string;
  /** What each side receives, already shortened to names. */
  youGet: string[];
  theyGet: string[];
  verdict?: string | null;
  yourTitleDelta: string;
  theirTitleDelta: string;
  bothGain: boolean;
}

const list = (names: string[]) => {
  if (names.length === 0) return 'nothing';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

export function hubShareMessage(facts: HubShareFacts): string {
  const where = facts.leagueName ? ` in ${facts.leagueName}` : '';
  const price = facts.titleOdds;
  const { rank, of } = facts;

  /* The standing is the whole tone. Being the favourite and being tenth are
     not the same message and one sentence cannot serve both without sounding
     like it was written by something that did not read the number. */
  let line: string;
  if (price == null) {
    line = `${facts.team}${where}, priced by the Gods.`;
  } else if (rank != null && of != null && rank === 1) {
    line = `Shortest price${where}: ${facts.team} at ${price} to win it all.`;
  } else if (rank != null && of != null && rank <= Math.ceil(of / 3)) {
    line = `${facts.team} is ${price} to win it all${where}. ${ordinal(rank)} of ${of}.`;
  } else if (rank != null && of != null && rank > of - Math.ceil(of / 3)) {
    line = `${price} to win it all${where}. ${ordinal(rank)} of ${of}. Somebody has to be.`;
  } else if (rank != null && of != null) {
    line = `${price} to win it all${where}, ${ordinal(rank)} of ${of}. Disrespectful.`;
  } else {
    line = `${facts.team} is ${price} to win it all${where}.`;
  }

  return `${line}\n\nPrice your team at oddsgods.net`;
}

export function tradeShareMessage(facts: TradeShareFacts): string {
  const head = `${facts.you} gets ${list(facts.youGet)}. ${facts.them} gets ${list(facts.theyGet)}.`;

  /* Both sides improving is the entire argument for pricing the other roster,
     so when it happens the message says it. When it does not, the message
     does not pretend otherwise; it just reports the two numbers. */
  const read = facts.bothGain
    ? `The book has us both better off: ${facts.yourTitleDelta} me, ${facts.theirTitleDelta} him, to win it all.`
    : `To win it all: ${facts.yourTitleDelta} me, ${facts.theirTitleDelta} him.`;

  const verdict = facts.verdict ? `${facts.verdict}. ` : '';
  return `${verdict}${head}\n\n${read}\n\nPriced at oddsgods.net`;
}

function ordinal(n: number) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * What the file is called once it is in someone's camera roll.
 *
 * "odds-gods.png" collides with every other card the same person saved, so the
 * second one lands as "odds-gods (1)" and nobody can tell them apart a month
 * later. Naming it by whose team it is and which week it was makes a saved
 * card findable and, when it gets re-shared as a file, self-describing.
 */
export function shareFilename(team: string, week?: number | null, kind = 'week') {
  const slug = team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const parts = [slug || 'my-team', 'odds-gods'];
  parts.push(kind === 'trade' ? 'trade' : `week-${week ?? 1}`);
  if (kind === 'trade' && week != null) parts.push(`week-${week}`);
  return `${parts.join('-')}.png`;
}

