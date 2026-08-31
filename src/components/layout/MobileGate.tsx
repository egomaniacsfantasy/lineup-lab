import { useState } from 'react';
import { LeaguePeek } from './LeaguePeek';
import { PENDING_SLEEPER_PARAM, rememberPendingSleeper } from '../../utils/pendingSleeper';
import { trackEvent } from '../../services/leagueApi';
import './MobileGate.css';

/**
 * The ticket window, on a phone.
 *
 * This began as a rejection screen and then became a pitch with a door in it:
 * a mark, five value propositions, and a "See your odds" button that revealed
 * the field. Every one of those steps was there because a phone could not use
 * the product, so the screen had to argue for a laptop before it could ask for
 * anything.
 *
 * A phone can use the product now. Signing in gets the short Hub, so this is
 * the same window the desktop page opens with, in the same words and the same
 * order: the mark, the line, the field, the other door, the way back in for
 * somebody who already has an account.
 *
 * What is still phone-specific is one sentence at the bottom about where the
 * rest of it lives, and that is the honest version of what used to be five
 * bullet points arguing for it.
 */

export function MobileGate() {
  const [door, setDoor] = useState<'espn' | null>(null);

  if (door === 'espn') return <EspnDoor onBack={() => setDoor(null)} />;

  return (
    <div className="mobile-gate">
      {/* Two slow amber drifts behind everything, and nothing readable in
          them. Decorative, so they are hidden from assistive tech and stand
          still entirely for anyone who has asked for less motion. */}
      <div aria-hidden="true" className="mobile-gate__glow" />
      <div aria-hidden="true" className="mobile-gate__glow mobile-gate__glow--second" />

      <main className="mobile-gate__inner">
        <LeaguePeek
          intro={
            <>
              <img
                alt=""
                className="mobile-gate__mark"
                height={128}
                src="/og-mark.png"
                width={128}
              />
              <p className="mobile-gate__wordmark">Odds Gods</p>

              {/* The desktop headline, set the same way: the scene small,
                  tracked and muted, then the line on its own with the room.
                  Staatliches has one weight, so the hierarchy is scale and
                  colour rather than a bolder cut. */}
              <h1 className="mobile-gate__headline">
                <span className="mobile-gate__headline-setup">
                  Somewhere in your league sits the championship favorite.
                </span>
                <span className="mobile-gate__headline-punch">
                  Odds are it isn&rsquo;t you.
                </span>
              </h1>
            </>
          }
          onCreateAccount={(username) => {
            /* A full navigation rather than a route change, because the gate
               sits above the router: on a phone there is nothing underneath it
               to push to. */
            rememberPendingSleeper(username);
            const query = username
              ? `?${PENDING_SLEEPER_PARAM}=${encodeURIComponent(username)}`
              : '';
            window.location.assign(`/signin${query}`);
          }}
          outro={
            <>
              <p className="mobile-gate__doors">
                <button
                  className="mobile-gate__door"
                  onClick={() => {
                    void trackEvent('phone_gate', 'door_espn');
                    setDoor('espn');
                  }}
                  type="button"
                >
                  My league is on ESPN
                </button>
              </p>

              {/* Missing entirely until now, on the screen every returning
                  visitor lands on. Somebody who already has an account is the
                  cheapest conversion there is and had no way in from here. */}
              <p className="mobile-gate__signin">
                Already have an account?{' '}
                <a className="mobile-gate__signin-link" href="/signin">
                  Sign in
                </a>
              </p>

              <p className="mobile-gate__fine">Completely free during the beta.</p>
              <p className="mobile-gate__fine mobile-gate__fine--where">
                The short version fits a phone. Trades, the predictor and the
                bet slip open on a laptop.
              </p>
            </>
          }
        />

        <span className="mobile-gate__address">oddsgods.net</span>
      </main>
    </div>
  );
}

/**
 * ESPN, on a phone.
 *
 * The same interstitial the desktop page shows, and for the same reason: ESPN
 * needs a signed-in browser session, which an account and a computer can do
 * and a landing screen must never ask for. This used to be one grey line
 * under the field saying that one needs a laptop, which is a door with no
 * handle on it.
 */
function EspnDoor({ onBack }: { onBack: () => void }) {
  return (
    <div className="mobile-gate">
      <div aria-hidden="true" className="mobile-gate__glow" />
      <div aria-hidden="true" className="mobile-gate__glow mobile-gate__glow--second" />

      <main className="mobile-gate__inner">
        <img alt="" className="mobile-gate__mark" height={128} src="/og-mark.png" width={128} />
        <h1 className="mobile-gate__headline">
          <span className="mobile-gate__headline-punch">
            ESPN connects after you make an account.
          </span>
        </h1>
        <p className="mobile-gate__copy">
          It takes about two minutes and needs a computer, because ESPN requires
          a signed in session. Worth it.
        </p>
        <a
          className="mobile-gate__open"
          href="/signin"
          onClick={() => void trackEvent('phone_gate', 'account_create', { from: 'espn' })}
        >
          Create a free account
        </a>
        <p className="mobile-gate__doors">
          <button className="mobile-gate__door" onClick={onBack} type="button">
            Back
          </button>
        </p>
        <span className="mobile-gate__address">oddsgods.net</span>
      </main>
    </div>
  );
}
