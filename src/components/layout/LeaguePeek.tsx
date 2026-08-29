import { useState } from 'react';
import { connectUsername, fetchBootstrap, fetchLines } from '../../services/leagueApi';
import type { ApiLeagueSummary } from '../../services/leagueApi';
import { formatProbOrOdds } from '../../utils/formatOdds';
import { TeamAvatar } from '../league/TeamAvatar';
import { SimulationLoader } from '../ui/SimulationLoader';
import './LeaguePeek.css';

/**
 * A username, and one number about your team.
 *
 * The phone screen used to be a wall: it made the case and then told you to
 * find a laptop, which is a handoff people do not make. This is the same
 * screen with a door in it. A Sleeper username is a text field, which works
 * on a phone in a way ESPN's cookie handshake never will, and the whole
 * path behind it already exists and is already cached: /api/connect, then
 * bootstrap and lines.
 *
 * What it shows is deliberately almost nothing. Your championship odds, and
 * the rest of your league listed by name with every number but yours locked.
 * Fantasy is not a solitary game and the itch is never "what are my odds", it
 * is "am I ahead of Dave" - so the tease is Dave's name with a lock where his
 * price should be. It is honest about what it is holding back: you can count
 * the rows and see exactly what an account buys.
 */

type Stage =
  | { name: 'idle' }
  | { name: 'working' }
  | { name: 'leagues'; user: PeekUser; leagues: ApiLeagueSummary[] }
  | { name: 'peek'; league: PeekLeague }
  | { name: 'failed'; message: string };

interface PeekUser {
  id: string;
  name: string;
}

interface PeekRow {
  rosterId: string;
  teamName: string;
  avatarUrl: string | null;
  isUser: boolean;
  titleProb: number;
}

interface PeekLeague {
  name: string;
  you: PeekRow;
  others: PeekRow[];
}

export function LeaguePeek({ onCreateAccount }: { onCreateAccount: () => void }) {
  const [username, setUsername] = useState('');
  const [stage, setStage] = useState<Stage>({ name: 'idle' });

  const look = async (user: PeekUser, league: ApiLeagueSummary) => {
    setStage({ name: 'working' });
    try {
      const [bootstrap, pricing] = await Promise.all([
        fetchBootstrap(league.id, user.id),
        fetchLines(league.id, user.id),
      ]);

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
        league: { name: league.name, you, others: rows.filter((row) => !row.isUser) },
      });
    } catch {
      setStage({ name: 'failed', message: 'We could not price that league just now.' });
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const handle = username.trim();
    if (!handle || stage.name === 'working') return;

    setStage({ name: 'working' });
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
        message: `We could not find a Sleeper account called ${handle}.`,
      });
    }
  };

  if (stage.name === 'working') {
    return (
      <div className="league-peek league-peek--busy">
        <SimulationLoader
          label="Pricing"
          messages={[
            'Finding your league...',
            'Running the season...',
            'Setting the price...',
          ]}
          size="compact"
          variant="scan"
        />
      </div>
    );
  }

  if (stage.name === 'leagues') {
    return (
      <div className="league-peek">
        <p className="league-peek__ask">Which league?</p>
        <ul className="league-peek__leagues">
          {stage.leagues.map((league) => (
            <li key={league.id}>
              <button
                className="league-peek__league"
                onClick={() => void look(stage.user, league)}
                type="button"
              >
                <span className="league-peek__league-name">{league.name}</span>
                <span className="league-peek__league-meta">{league.totalTeams} teams</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (stage.name === 'peek') {
    const { league } = stage;
    return (
      <div className="league-peek league-peek--result">
        <span className="league-peek__eyebrow">{league.name}</span>

        {/* The number, at the size it deserves. It is the only one on the
            screen that is not behind a lock. */}
        <span className="league-peek__odds">{formatProbOrOdds(league.you.titleProb)}</span>
        <span className="league-peek__odds-label">to win it all</span>

        <div className="league-peek__you">
          <TeamAvatar avatarUrl={league.you.avatarUrl} name={league.you.teamName} />
          <span className="league-peek__you-name">{league.you.teamName}</span>
        </div>

        {/* Names shown, prices locked. Hiding the names too would make this a
            list of nobody; showing them makes it unmistakably YOUR league,
            and puts the question you actually want answered one tap away. */}
        <ul className="league-peek__rivals">
          {league.others.map((row) => (
            <li className="league-peek__rival" key={row.rosterId}>
              <TeamAvatar avatarUrl={row.avatarUrl} name={row.teamName} />
              <span className="league-peek__rival-name">{row.teamName}</span>
              <span aria-label="locked" className="league-peek__lock">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13">
                  <path
                    d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 1 0-6 0v3Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </li>
          ))}
        </ul>

        <button className="league-peek__cta" onClick={onCreateAccount} type="button">
          See the whole league
        </button>
        <p className="league-peek__cta-note">
          Free during the beta. No card, one account for every league you are in.
        </p>
      </div>
    );
  }

  return (
    <form className="league-peek" onSubmit={submit}>
      <label className="league-peek__ask" htmlFor="peek-username">
        Your Sleeper username
      </label>
      <div className="league-peek__row">
        <input
          autoCapitalize="none"
          autoCorrect="off"
          className="league-peek__input"
          id="peek-username"
          onChange={(event) => setUsername(event.target.value)}
          placeholder="username"
          spellCheck={false}
          value={username}
        />
        <button className="league-peek__go" disabled={username.trim().length === 0} type="submit">
          See my odds
        </button>
      </div>
      {stage.name === 'failed' ? (
        <p className="league-peek__error" role="status">
          {stage.message}
        </p>
      ) : (
        <p className="league-peek__hint">
          {/* ESPN needs a cookie handshake a phone browser cannot do, so it is
              named as a desktop path rather than offered and then failing. */}
          On ESPN? That one needs a laptop.
        </p>
      )}
    </form>
  );
}
