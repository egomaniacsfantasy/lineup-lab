import { useState } from 'react';
import { usePeek } from '../../hooks/usePeek';
import { ShareCardPreview } from '../matchup/ShareCardPreview';
import { drawShareCard } from '../../utils/shareCard';
import { peekShareCard } from '../../utils/peekShareCard';
import { DynastyScopeNote } from './DynastyScopeNote';
import { NO_VALUE, formatAmericanOdds, formatProbOrOdds, formatProjectionPoints } from '../../utils/formatOdds';
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
 * What it shows: one whole matchup, unlocked, then your championship price,
 * then the rest of your league by name with every number but yours behind a
 * lock.
 *
 * The matchup is the part that earns the rest. A championship price on its own
 * is one number from a machine nobody has watched work, so the locked rows
 * underneath are asking for an account on trust. A priced matchup is the
 * product doing the thing it claims to do, on their own league, against a
 * manager they know, before anything is asked of them. The locks then read as
 * more of a thing that already works rather than as the first thing they see.
 *
 * Fantasy is not a solitary game and the itch is never "what are my odds", it
 * is "am I ahead of Dave" - so the tease is Dave's name with a lock where his
 * price should be. It is honest about what it is holding back: you can count
 * the rows and see exactly what an account buys.
 */

export function LeaguePeek({ onCreateAccount }: { onCreateAccount: (username: string) => void }) {
  /* The machine is shared with the landing page, which runs the identical
     path on a screen that looks nothing like this one. See usePeek. */
  const { username, setUsername, stage, submit, look } = usePeek('phone_gate');
  const [sharing, setSharing] = useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (stage.name === 'working') return;
    void submit(username);
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
    const game = league.matchup;

    return (
      <div className="league-peek league-peek--result">
        <span className="league-peek__eyebrow">{league.name}</span>

        {/* One whole matchup, unlocked.

            This is the product working, on their league, before anything is
            asked of them. It sits above the championship price on purpose: a
            season-long number is an assertion, and a priced game against a
            manager they know is a demonstration. The demonstration goes
            first. */}
        {game ? (
          <section className="league-peek__game" aria-label={`Week ${game.week} matchup`}>
            <span className="league-peek__game-week">Week {game.week}</span>

            <div className="league-peek__game-grid">
              {[game.you, game.them].map((side, index) => (
                <div
                  className={
                    index === 0
                      ? 'league-peek__game-side league-peek__game-side--you'
                      : 'league-peek__game-side'
                  }
                  key={side.teamName + String(index)}
                >
                  <TeamAvatar avatarUrl={side.avatarUrl} name={side.teamName} />
                  <span className="league-peek__game-name">{side.teamName}</span>
                  <span className="league-peek__game-record">{side.record}</span>
                  {/* American only. The gate runs above every provider, so
                      there is no format toggle here to disagree with, and the
                      module default is American. Never both at once. */}
                  <span className="league-peek__game-price">
                    {game.priced ? formatAmericanOdds(side.moneyline) : NO_VALUE}
                  </span>
                  <span className="league-peek__game-proj">
                    {formatProjectionPoints(side.projection, game.priced)} pts
                  </span>
                </div>
              ))}
            </div>

            {/* The bar is the only place a percentage appears, and there is no
                price beside it. Amber is you; the remainder is the neutral
                rule underneath rather than a second team colour. */}
            <div
              aria-label={`Win probability ${game.you.winProbability.toFixed(1)} percent`}
              className="league-peek__game-bar"
              role="img"
            >
              <span
                className="league-peek__game-bar-fill"
                style={{ width: `${game.priced ? Math.max(2, Math.min(98, game.you.winProbability)) : 0}%` }}
              />
            </div>
            <span className="league-peek__game-bar-label">
              {game.priced
                ? `${game.you.winProbability.toFixed(1)}% you`
                : 'Pricing this week now.'}
            </span>
          </section>
        ) : null}

        {/* The number, at the size it deserves. */}
        <span className="league-peek__odds">{formatProbOrOdds(league.you.titleProb)}</span>
        <span className="league-peek__odds-label">to win it all</span>

        <div className="league-peek__you">
          <TeamAvatar avatarUrl={league.you.avatarUrl} name={league.you.teamName} />
          <span className="league-peek__you-name">{league.you.teamName}</span>
        </div>

        <DynastyScopeNote leagueType={league.leagueType} />

        {/* What the locks are hiding, said once, in front of them. Someone who
            has just watched one game get priced is being told the same thing
            has been done to every other game in their league. */}
        <p className="league-peek__pitch">
          The rest of the book is open. Moneylines, spreads and totals on every
          matchup in your league, championship odds that move all week, and a
          bet slip that parlays your own league at fair odds.
          {/* The trade finder is not offered to a league it does not serve.
              The scope note directly above says trade pricing is off here, and
              following that with "plus a trade finder" is the product
              contradicting itself inside two sentences, on the screen where it
              is asking to be believed. */}
          {league.leagueType === 'redraft'
            ? ' Plus a trade finder that prices every deal from both sides and tells you whether he will accept.'
            : ''}
        </p>

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

        {/* The account is the conversion and stays the filled one. The card is
            the loop, and the phone is where a group chat is. */}
        <button className="league-peek__cta" onClick={() => onCreateAccount(username.trim())} type="button">
          Create a free account
        </button>
        <button
          className="league-peek__share"
          onClick={() => setSharing(true)}
          type="button"
        >
          Share my card
        </button>
        <p className="league-peek__cta-note">
          The full book opens on a laptop or desktop. Free during the beta.
        </p>

        {sharing ? (
          <ShareCardPreview
            draw={(options) => drawShareCard(peekShareCard(league), options)}
            message={`${league.you.teamName} is ${formatProbOrOdds(league.you.titleProb)} to win ${league.name}.`}
            onClose={() => setSharing(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <form className="league-peek" onSubmit={onSubmit}>
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
