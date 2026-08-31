import { useCallback, useState } from 'react';
import { connectUsername, fetchBootstrap, fetchLines, trackEvent } from '../services/leagueApi';
import type { ApiLeagueSummary, LeagueBootstrap, LeaguePricing } from '../services/leagueApi';

/**
 * A Sleeper username, and the book it opens.
 *
 * The whole anonymous path, with no opinion about how it looks. Two screens
 * run it: the phone gate, where it is the only way in, and the landing page,
 * where it IS the landing page. Those two look nothing alike and should not,
 * but they must behave identically, and they were about to be two copies of a
 * five-state machine that talks to three endpoints and has a retry in it.
 *
 * So the machine lives here and the screens decide what it looks like.
 */

export interface PeekUser {
  id: string;
  name: string;
}

export interface PeekRow {
  rosterId: string;
  teamName: string;
  avatarUrl: string | null;
  isUser: boolean;
  titleProb: number;
}

/**
 * One side of the unlocked matchup.
 *
 * `priced` travels with the side rather than being inferred from the numbers,
 * because a league that has just been read has real teams and no projections
 * yet: every player means 0.0 and the price is not a price. Zero is a claim
 * ("this roster scores nothing") and a dash is the truth ("not yet known").
 */
export interface PeekSide {
  teamName: string;
  avatarUrl: string | null;
  record: string;
  moneyline: number;
  winProbability: number;
  projection: number;
}

export interface PeekMatchup {
  week: number;
  priced: boolean;
  you: PeekSide;
  them: PeekSide;
}

export interface PeekLeague {
  name: string;
  you: PeekRow;
  others: PeekRow[];
  matchup: PeekMatchup | null;
}

export type PeekStage =
  | { name: 'idle' }
  | { name: 'working' }
  | { name: 'leagues'; user: PeekUser; leagues: ApiLeagueSummary[] }
  | { name: 'peek'; league: PeekLeague }
  | { name: 'failed'; message: string };

/**
 * The user's current-week matchup, as two priced sides.
 *
 * Everything here already arrives with the peek's existing two calls; nothing
 * new is fetched. The line is looked up by roster id rather than by position
 * in the list, because a side is keyed by roster and there is no guarantee the
 * user is the first key in it.
 *
 * Returns null rather than a half-filled shape whenever any of it is missing:
 * a bye week, a league whose schedule has not been read, a matchup the engine
 * has not priced. The screen then shows the championship price on its own,
 * which is what both screens showed before this existed.
 */
export function buildPeekMatchup(
  bootstrap: LeagueBootstrap,
  pricing: LeaguePricing,
  userRosterId: string,
): PeekMatchup | null {
  const week = pricing.week ?? null;
  const line = (pricing.lines ?? []).find(
    (candidate) => (week == null || candidate.week === week) && candidate.sides[userRosterId],
  );
  if (!line) return null;

  const opponentRosterId = Object.keys(line.sides).find((id) => id !== userRosterId);
  if (!opponentRosterId) return null;

  const yourSide = line.sides[userRosterId];
  const theirSide = line.sides[opponentRosterId];
  if (!yourSide || !theirSide) return null;

  const teamFor = (rosterId: string) =>
    (bootstrap.teams ?? []).find((team) => String(team.rosterId) === rosterId) ?? null;
  const you = teamFor(userRosterId);
  const them = teamFor(opponentRosterId);
  if (!you || !them) return null;

  const recordOf = (team: NonNullable<typeof you>) => {
    const { wins, losses, ties } = team.record;
    return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  };

  const side = (
    team: NonNullable<typeof you>,
    priced: (typeof line.sides)[string],
  ): PeekSide => ({
    teamName: team.teamName,
    avatarUrl: team.avatarUrl ?? null,
    record: recordOf(team),
    moneyline: priced.moneyline,
    winProbability: priced.winProbability,
    projection: priced.projection,
  });

  return {
    week: line.week,
    priced: pricing.available,
    you: side(you, yourSide),
    them: side(them, theirSide),
  };
}

/* How long a screen is willing to wait for a league that is mid-sync, and how
   often it asks. Six tries at two seconds covers the normal case comfortably
   without leaving somebody on a spinner for ever if the import is genuinely
   stuck. */
const PRICING_RETRIES = 6;
const PRICING_RETRY_MS = 2_000;

export function usePeek(area: string) {
  const [username, setUsername] = useState('');
  const [stage, setStage] = useState<PeekStage>({ name: 'idle' });

  const look = useCallback(
    async (user: PeekUser, league: ApiLeagueSummary, attempt = 0) => {
      setStage({ name: 'working' });
      try {
        const [bootstrap, pricing] = await Promise.all([
          fetchBootstrap(league.id, user.id),
          fetchLines(league.id, user.id),
        ]);

        /* A league nobody has priced yet.
         *
         * The first seconds after a league is read have real teams and real
         * records and no projections behind them, so the pricing call answers
         * available:false with nothing in it. Every number these screens exist
         * to show comes out of that call.
         *
         * It used to fall through to the futures list, find it empty, fail to
         * find the user in it and report "we found your league but could not
         * find your team in it" - which is a different problem, is not true,
         * and lands on the screens most of the paid traffic arrives on.
         *
         * So it waits. The window is seconds and the answer is worth the
         * pause: somebody who asked for their odds wants their odds, not a
         * screen of dashes explaining that the odds are coming. */
        if (!pricing.available) {
          if (attempt < PRICING_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, PRICING_RETRY_MS));
            await look(user, league, attempt + 1);
            return;
          }
          setStage({
            name: 'failed',
            message: `${league.name} is still being priced. Give it a minute and try again.`,
          });
          return;
        }

        /* Crests live on the bootstrap and prices on the lines, keyed by the
           same roster id. */
        const crests = new Map(
          (bootstrap.teams ?? []).map((team) => [String(team.rosterId), team.avatarUrl ?? null]),
        );
        const rows: PeekRow[] = [...(pricing.futures ?? [])]
          .sort((a, b) => b.titleProb - a.titleProb)
          .map((team) => ({
            rosterId: String(team.rosterId),
            teamName: team.teamName,
            avatarUrl: crests.get(String(team.rosterId)) ?? null,
            isUser: Boolean(team.isUser),
            titleProb: team.titleProb,
          }));

        const you = rows.find((row) => row.isUser);
        if (!you) {
          setStage({
            name: 'failed',
            message: `We found ${league.name} but could not find your team in it.`,
          });
          return;
        }

        setStage({
          name: 'peek',
          league: {
            name: league.name,
            you,
            others: rows.filter((row) => !row.isUser),
            matchup: buildPeekMatchup(bootstrap, pricing, you.rosterId),
          },
        });
        void trackEvent(area, 'priced', { teams: rows.length });
      } catch {
        setStage({
          name: 'failed',
          message: 'The league provider did not respond. Try again in a minute.',
        });
      }
    },
    [area],
  );

  const submit = useCallback(
    async (raw: string) => {
      const handle = raw.trim();
      if (!handle) return;

      setStage({ name: 'working' });
      void trackEvent(area, 'username_submitted');
      try {
        const result = await connectUsername(handle);
        const user = { id: result.user.id, name: result.user.displayName ?? handle };
        const leagues = result.leagues ?? [];

        if (leagues.length === 0) {
          setStage({ name: 'failed', message: `No leagues found for ${handle} this season.` });
          return;
        }
        /* One league is not a choice, so it is not a screen. */
        if (leagues.length === 1) {
          await look(user, leagues[0]);
          return;
        }
        setStage({ name: 'leagues', user, leagues });
      } catch {
        setStage({
          name: 'failed',
          message: `No Sleeper account by that name. Check the spelling?`,
        });
      }
    },
    [area, look],
  );

  return { username, setUsername, stage, submit, look, reset: () => setStage({ name: 'idle' }) };
}
