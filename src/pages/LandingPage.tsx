import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePeek, type PeekLeague } from '../hooks/usePeek';
import type { ApiLeagueSummary } from '../services/leagueApi';
import { PRICING_LINES } from '../components/layout/pricingLines';
import { PENDING_SLEEPER_PARAM, rememberPendingConnection, rememberPendingSleeper } from '../utils/pendingSleeper';
import { trackEvent } from '../services/leagueApi';
import { NO_VALUE, formatAmericanOdds, formatProbOrOdds, formatProjectionPoints } from '../utils/formatOdds';
import { TeamAvatar } from '../components/league/TeamAvatar';
import { DynastyScopeNote } from '../components/layout/DynastyScopeNote';
import { MatchupPage } from './MatchupPage';
import { ShareCardPreview } from '../components/matchup/ShareCardPreview';
import { drawShareCard } from '../utils/shareCard';
import { peekShareCard } from '../utils/peekShareCard';
import { useAuth } from '../contexts/AuthContext';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import mark from '../assets/og-hero.png';
import styles from './LandingPage.module.css';

/**
 * The ticket window.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED, AND WHY
 *
 * The old page described the product beside a demo league: a real futures
 * board running on twelve invented teams, a rotating trade card, a line that
 * moved. It was the best-looking thing we had shipped and it was selling the
 * wrong thing. A stranger read about Mount Olympus, which is nobody's league,
 * and the argument the page had to win was never "is this well made", it was
 * "does this know anything about MY team".
 *
 * So the page asks for one string, and the moment it has it, it stops being a
 * page about the product and becomes the product, pointed at the visitor's own
 * league. The transformation is the pitch. There is nothing else on the first
 * screen because anything else would be competing with the field.
 *
 * One viewport, no scrolling, in the first state. If a thing does not fit, it
 * does not belong.
 */

/* Two or three seconds is the point, not the cost: this is the first time
   anybody watches the book work, and rushing it would waste the one moment
   the product performs before it is asked for anything. */
const LINE_MS = 1100;

type Door = 'espn' | null;

export function LandingPage() {
  const { username, setUsername, stage, submit, look } = usePeek('landing');
  const [door, setDoor] = useState<Door>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void trackEvent('landing', 'view');
  }, []);

  const priced = stage.name === 'peek';

  return (
    <main className={priced ? `${styles.stage} ${styles.stagePriced}` : styles.stage}>
      {/* Two slow amber masses behind everything, and nothing readable in
          them. Blurred radial gradients rather than an animated background
          position: a gradient animation repaints the whole surface every
          frame, and a transform on a blurred layer is composited. */}
      <div aria-hidden="true" className={styles.glow} />
      <div aria-hidden="true" className={`${styles.glow} ${styles.glowSecond}`} />

      {stage.name === 'peek' ? (
        <Book league={stage.league} username={username} />
      ) : stage.name === 'working' ? (
        <Pricing />
      ) : stage.name === 'leagues' ? (
        <WhichLeague
          leagues={stage.leagues}
          onPick={(league) => void look(stage.user, league)}
          user={stage.user.name}
        />
      ) : door === 'espn' ? (
        <EspnDoor onBack={() => setDoor(null)} />
      ) : (
        <Window
          error={stage.name === 'failed' ? stage.message : null}
          inputRef={inputRef}
          onEspn={() => {
            void trackEvent('landing', 'door_espn');
            setDoor('espn');
          }}
          onSubmit={() => void submit(username)}
          setUsername={setUsername}
          username={username}
        />
      )}
    </main>
  );
}

/* ── State 1: the window ─────────────────────────────────────────────── */

function Window({
  error,
  inputRef,
  onEspn,
  onSubmit,
  setUsername,
  username,
}: {
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEspn: () => void;
  onSubmit: () => void;
  setUsername: (value: string) => void;
  username: string;
}) {
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  return (
    <section className={styles.window}>
      {/* The mark is the identity of this screen rather than an ornament on
          top of it, so it is drawn at the size that makes it one. It is also
          what spins while the league is priced: the dice are literally the
          thing that rolls ten thousand times. */}
      <img alt="" className={styles.mark} src={mark} />
      <p className={styles.wordmark}>Odds Gods</p>

      {/* Two tiers, because the sentence has two jobs.
      
          The first half sets the scene and the second half is the line. Set at
          one size they compete, and the punch lands in the middle of a
          paragraph. Staatliches has a single weight, so the hierarchy is scale
          and colour rather than a bolder cut: the setup runs small, tracked
          and muted, and the payoff gets the room.
      
          It replaced "Ten thousand simulations are about to have an opinion
          about your team", which sold the machine. That is a sentence a data
          scientist would write, and it walks away from the sportsbook framing
          the whole product rests on. */}
      <h1 className={styles.headline}>
        <span className={styles.headlineSetup}>
          Somewhere in your league sits the championship favorite.
        </span>
        <span className={styles.headlinePunch}>Odds are it isn&rsquo;t you.</span>
      </h1>

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect="off"
          className={styles.input}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Your Sleeper username"
          ref={inputRef}
          spellCheck={false}
          value={username}
        />
        <button className={styles.go} disabled={username.trim().length === 0} type="submit">
          Price my league
        </button>
      </form>

      {/* The field survives a miss, and so do the other doors: somebody who
          mistyped may in fact be an ESPN manager who has no Sleeper name to
          spell correctly, and a dead end here is the end of the visit. */}
      {error ? (
        <p className={styles.error} role="status">
          {error}
        </p>
      ) : null}

      {/* One door, not two. "Just looking?" offered a stranger somebody
          else's league at the exact moment they were deciding whether to type
          their own, which is the one moment this page has. The demo still
          exists at /demo for anywhere else that wants it. */}
      <p className={styles.doors}>
        <button className={styles.door} onClick={onEspn} type="button">
          My league is on ESPN
        </button>
      </p>

      <p className={styles.signIn}>
        Already have an account? <Link className={styles.signInLink} to="/signin">Sign in</Link>
      </p>
      {/* One clause. The other two were answering questions nobody had asked
          yet: a simulation count means nothing before you have seen a number,
          and "no money anywhere in this" raises the spectre of money on a
          screen that had not mentioned it. */}
      <p className={styles.fine}>Completely free during the beta.</p>
    </section>
  );
}

/* ── The ESPN door ───────────────────────────────────────────────────── */

function EspnDoor({ onBack }: { onBack: () => void }) {
  /* An interstitial, not a wall, and never a credential field. ESPN needs a
     signed-in browser session, which is a thing an account and a computer can
     do and a landing page must not ask for. Saying how long it takes and why
     is the difference between a hurdle and a door. */
  return (
    <section className={styles.window}>
      <img alt="" className={styles.markSmall} src={mark} />
      <h1 className={styles.headline}>ESPN leagues connect after you make an account.</h1>
      <p className={styles.espnCopy}>
        It takes about two minutes and needs a computer, because ESPN requires a
        signed in session. Worth it.
      </p>
      <Link
        className={styles.go}
        onClick={() => void trackEvent('landing', 'account_create', { from: 'espn' })}
        to="/signin"
      >
        Create a free account
      </Link>
      <p className={styles.doors}>
        <button className={styles.door} onClick={onBack} type="button">
          Back
        </button>
      </p>
    </section>
  );
}

/* ── State 2: pricing ────────────────────────────────────────────────── */

function Pricing() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % PRICING_LINES.length),
      LINE_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section aria-busy="true" className={styles.window} role="status">
      {/* The same mark, rolling. */}
      <img alt="" className={`${styles.mark} ${styles.markRolling}`} src={mark} />
      <p className={styles.wordmark}>Odds Gods</p>
      <p className={styles.pricingLine}>{PRICING_LINES[index]}...</p>
    </section>
  );
}

/* ── The pick-a-league step ──────────────────────────────────────────── */

function WhichLeague({
  leagues,
  onPick,
  user,
}: {
  leagues: ApiLeagueSummary[];
  onPick: (league: ApiLeagueSummary) => void;
  user: string;
}) {
  return (
    <section className={styles.window}>
      <img alt="" className={styles.markSmall} src={mark} />
      <h1 className={styles.headline}>Which one is yours, {user}?</h1>
      <ul className={styles.leagues}>
        {leagues.map((league) => (
          <li key={league.id}>
            <button className={styles.league} onClick={() => onPick(league)} type="button">
              <span>{league.name}</span>
              <span className={styles.leagueMeta}>{league.totalTeams} teams</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── State 3: their book ─────────────────────────────────────────────── */

function Book({ league, username }: { league: PeekLeague; username: string }) {
  const game = league.matchup;
  const [sharing, setSharing] = useState(false);

  return (
    <section className={styles.book}>
      <header className={styles.bookHead}>
        <img alt="" className={styles.markSmall} src={mark} />
        <p className={styles.bookLeague}>{league.name}</p>
      </header>

      {game ? (
        <div className={styles.game}>
          <span className={styles.gameWeek}>Week {game.week}</span>
          <div className={styles.gameGrid}>
            {[game.you, game.them].map((side, index) => (
              <div
                className={index === 0 ? `${styles.side} ${styles.sideYou}` : styles.side}
                key={side.teamName + String(index)}
              >
                <TeamAvatar avatarUrl={side.avatarUrl} name={side.teamName} />
                <span className={styles.sideName}>{side.teamName}</span>
                <span className={styles.sideRecord}>{side.record}</span>
                <span className={styles.sidePrice}>
                  {game.priced ? formatAmericanOdds(side.moneyline) : NO_VALUE}
                </span>
                <span className={styles.sideProj}>
                  {formatProjectionPoints(side.projection, game.priced)} pts
                </span>
              </div>
            ))}
          </div>
          {/* The bar carries the only percentage on the screen, and there is
              no price beside it: one unit at a time. */}
          <div
            aria-label={`Win probability ${game.you.winProbability.toFixed(1)} percent`}
            className={styles.bar}
            role="img"
          >
            <span
              className={styles.barFill}
              style={{
                width: `${game.priced ? Math.max(2, Math.min(98, game.you.winProbability)) : 0}%`,
              }}
            />
          </div>
          <span className={styles.barLabel}>
            {game.priced ? `${game.you.winProbability.toFixed(1)}% you` : 'Pricing this week now.'}
          </span>
        </div>
      ) : null}

      <div className={styles.title}>
        <span className={styles.titleLabel}>To win it all</span>
        <span className={styles.titlePrice}>{formatProbOrOdds(league.you.titleProb)}</span>
        <span className={styles.titleTeam}>{league.you.teamName}</span>
      </div>

      {/* Names shown, prices locked. Hiding the names would make this a list
          of nobody; showing them makes it unmistakably THEIR league, and puts
          the question they actually want answered one click away. */}
      <ol className={styles.table}>
        {[league.you, ...league.others]
          .slice()
          .sort((a, b) => b.titleProb - a.titleProb)
          .map((row, index) => (
            <li
              className={row.isUser ? `${styles.row} ${styles.rowYou}` : styles.row}
              key={row.rosterId}
            >
              <span className={styles.rank}>{index + 1}</span>
              <TeamAvatar avatarUrl={row.avatarUrl} name={row.teamName} />
              <span className={styles.rowName}>{row.teamName}</span>
              {row.isUser ? (
                <span className={styles.rowPrice}>{formatProbOrOdds(row.titleProb)}</span>
              ) : (
                <span aria-label="locked" className={styles.lock}>
                  <svg aria-hidden="true" height="13" viewBox="0 0 24 24" width="13">
                    <path
                      d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 1 0-6 0v3Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              )}
            </li>
          ))}
      </ol>

      <DynastyScopeNote leagueType={league.leagueType} />

      {/* Two things to do with a number you have just been shown, and they are
          not rivals. The account is the conversion and stays the filled one.
          The card is the loop: it carries the address into a group chat, and
          the person most likely to send one is somebody who just watched their
          own price appear and has not committed to anything yet. Asking them
          to choose between the two would be pretending sharing costs us
          something. */}
      <div className={styles.actions}>
        <a
          className={styles.go}
          href={`/signin?${PENDING_SLEEPER_PARAM}=${encodeURIComponent(username.trim())}`}
          onClick={() => {
            /* The whole connection, not just the name. They have already
               picked this league and watched it get priced; asking them to do
               both again after the form is the same sync twice. */
            rememberPendingSleeper(username);
            rememberPendingConnection(league.connection);
            void trackEvent('landing', 'account_create', { from: 'book' });
          }}
        >
          Create a free account
        </a>
        <button
          className={styles.secondary}
          onClick={() => {
            setSharing(true);
            void trackEvent('landing', 'share_card');
          }}
          type="button"
        >
          Share my card
        </button>
      </div>
      <p className={styles.fine}>
        The whole book opens when you do. Free during the beta.
      </p>

      {sharing ? (
        <ShareCardPreview
          draw={(options) => drawShareCard(peekShareCard(league), options)}
          message={`${league.you.teamName} is ${formatProbOrOdds(league.you.titleProb)} to win ${league.name}.`}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * The demo, which answers for everybody.
 *
 * The Hub falls back to the sample league whenever nothing is connected, so
 * this is the Hub with a banner on it rather than a second implementation of
 * it. The banner is the only way out of the demo, so it has to lead somewhere
 * real in every state: to the sign-up form for a stranger, and to their own
 * league for anyone who already has one.
 */
export function DemoPage() {
  const { session } = useAuth();
  const { stored } = useLeagueConnection();
  const exit = !session ? '/signin' : stored ? '/matchup' : '/connect';

  return (
    <div className={styles.demoShell}>
      <a className={styles.demoBanner} href={exit}>
        {session && stored
          ? 'Demo league · Back to your league →'
          : 'Demo league · Price your own league →'}
      </a>
      <MatchupPage />
    </div>
  );
}
