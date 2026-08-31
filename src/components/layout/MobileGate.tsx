import { useState } from 'react';
import { LeaguePeek } from './LeaguePeek';
import { PENDING_SLEEPER_PARAM, rememberPendingSleeper } from '../../utils/pendingSleeper';
import './MobileGate.css';

/**
 * The phone, turned away politely.
 *
 * The web layout is built for a screen that can hold a whole book at once,
 * and a phone cannot. Rather than serve a cramped version of it and let
 * people decide for themselves that the product is bad, this says so and
 * sends them somewhere it is good.
 *
 * Who is exempt from it, and why, is in useIsPhone.
 */

export function MobileGate() {
  /* The pitch stays until someone asks for their odds, then the screen turns
     into the thing it was advertising. Two screens would mean a navigation
     step between the ad and the payoff, on the surface with the least
     patience for one. */
  const [open, setOpen] = useState(false);

  return (
    <div className={`mobile-gate${open ? ' mobile-gate--peeking' : ''}`}>
      {/* Two slow amber drifts behind everything, and nothing readable in
          them. Decorative, so they are hidden from assistive tech and stand
          still entirely for anyone who has asked for less motion. */}
      <div aria-hidden="true" className="mobile-gate__glow" />
      <div aria-hidden="true" className="mobile-gate__glow mobile-gate__glow--second" />

      <main className="mobile-gate__inner">
        <div className="mobile-gate__brand">
          <img alt="" className="mobile-gate__mark" height={128} src="/og-mark.png" width={128} />
          <span className="mobile-gate__wordmark">ODDS GODS</span>
        </div>

        {/* The pitch, not the rejection.

            Most people arrive here from an advert on a phone, which makes
            this the first and possibly the only screen they ever see. A
            screen whose whole message is "not here" spends that on an
            apology. It should spend it on why the laptop is worth walking to.

            Every claim below is a surface that has shipped, checked against
            the routes rather than against the comments describing them. A
            value proposition the product cannot deliver on is the one that
            gets remembered. */}
        {open ? null : (
          <h1 className="mobile-gate__headline">There&rsquo;s a book on your league.</h1>
        )}

        {/* The pitch converts once. After that it is five lines of argument
            standing between someone and the number they just asked for, on a
            screen with no room to spare. */}
        {open ? null : (
        <ul className="mobile-gate__props">
          <li>Every matchup priced. Moneyline, spread and total.</li>
          <li>Championship odds for every team, moving all week.</li>
          <li>Trades worth making, priced from both sides.</li>
          <li>Call the rest of the season and watch the bracket move.</li>
          <li>Parlay your own league, at fair odds.</li>
        </ul>
        )}

        {/* "During the beta", not a flat "free". It is what the sign-up form
            already says, so the two cannot contradict each other, and it is
            the better line anyway: free that will not always be free. */}
        {open ? null : <p className="mobile-gate__free">All of it free during the beta.</p>}

        {/* The door.

            This screen used to end in "go and find a laptop", which is a
            handoff most people never make: the card that brought them here
            was forwarded into a group chat and opened on a phone, so a wall
            here breaks the loop the card exists to start. A Sleeper username
            is a text field, and a text field works on a phone. */}
        {open ? (
          <LeaguePeek
            /* Straight to the sign-up form, carrying who they are on Sleeper.
               A full navigation rather than a route change because the gate
               sits above the router: on a phone there is no router underneath
               it to push to. /signin is exempt from the gate for exactly this
               reason, so the form renders instead of bouncing back here. */
            onCreateAccount={(username) => {
              rememberPendingSleeper(username);
              const query = username
                ? `?${PENDING_SLEEPER_PARAM}=${encodeURIComponent(username)}`
                : '';
              window.location.assign(`/signin${query}`);
            }}
          />
        ) : (
          <>
            <button
              className="mobile-gate__open"
              onClick={() => setOpen(true)}
              type="button"
            >
              See your odds
            </button>
            <p className="mobile-gate__copy">
              One Sleeper username. The rest of it opens on a laptop or tablet,
              where the whole book fits on one screen.
            </p>
          </>
        )}

        <span className="mobile-gate__address">oddsgods.net</span>
      </main>
    </div>
  );
}
