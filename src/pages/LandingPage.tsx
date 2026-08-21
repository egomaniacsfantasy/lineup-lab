import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import logo from '../assets/og-logo.png';
import { useReel } from '../hooks/useReel';
import { LeagueFutures } from '../components/league/LeagueFutures';
import { MOCK_LEAGUE_FUTURES } from '../mocks/league';
import { MOCK_LEAGUE_HISTORY } from '../mocks/leagueHistory';
import { formatAcceptancePercent, getAcceptanceLingo } from '../utils/acceptanceLingo';
import { formatAmericanOdds } from '../utils/formatOdds';
import { LINE_FRAMES, TRADE_FRAMES, type TradeFrame } from './landingReel';
import { MatchupPage } from './MatchupPage';
import styles from './LandingPage.module.css';

/**
 * The hero used to be three invented cards floating next to the copy. Two of
 * them advertised things that are not the product: a start/sit toggle, which
 * every fantasy site has had for fifteen years, and a package of two top-twelve
 * players for one at 38% acceptance, which is a trade nobody sends and an
 * example of the tool saying no.
 *
 * So the hero is the product now. The board below is the real LeagueFutures
 * component, the same one the League tab renders, running on the demo league.
 * The market toggle works, the chart is thirty real days of authored history,
 * and everything a visitor clicks is a thing they will find again after they
 * connect a league. Nothing here computes: LeagueFutures formats what it is
 * handed, and what it is handed is a book that balances (see src/mocks/league.ts).
 */

function DemoFutures() {
  return (
    <div aria-label="The demo league's futures market" className={styles.heroBoard}>
      <LeagueFutures
        currentWeek={8}
        futures={MOCK_LEAGUE_FUTURES}
        history={MOCK_LEAGUE_HISTORY}
        leagueName="Mount Olympus"
        mode="inseason"
        playoffTeams={6}
        scoringFormat="half-ppr"
        totalTeams={12}
      />
    </div>
  );
}

function LineCard() {
  const frame = LINE_FRAMES[useReel(LINE_FRAMES.length, 3600)];
  const moved = frame.move !== 0;

  return (
    <article className={styles.boardCard}>
      <div className={styles.boardCardHead}>
        <span>Week 8 · head-to-head</span>
        <span className={styles.boardLive}>Live line</span>
      </div>
      <div className={styles.boardFaceoff}>
        <div>
          <p className={styles.boardTeam}>{frame.you.team}</p>
          <p className={styles.boardNumber} key={frame.you.moneyline}>
            {formatAmericanOdds(frame.you.moneyline)}
          </p>
        </div>
        <span className={styles.boardVs}>VS</span>
        <div className={styles.boardFaceoffRight}>
          <p className={styles.boardTeam}>{frame.them.team}</p>
          <p className={styles.boardNumberDim} key={frame.them.moneyline}>
            {formatAmericanOdds(frame.them.moneyline)}
          </p>
        </div>
      </div>
      <div aria-hidden="true" className={styles.boardBar}>
        <span style={{ width: `${frame.you.prob}%` }} />
      </div>
      <div className={styles.boardBarLabels}>
        <span>{frame.you.prob.toFixed(1)}% you</span>
        <span>{frame.them.prob.toFixed(1)}% them</span>
      </div>
      <p className={styles.boardTicker} key={frame.note}>
        <span className={styles.boardTickerNote}>{frame.note}</span>
        {moved ? (
          <span className={frame.move > 0 ? styles.boardTickerUp : styles.boardTickerDown}>
            {frame.move > 0 ? '▲' : '▼'} {Math.abs(frame.move).toFixed(1)}%
          </span>
        ) : null}
      </p>
    </article>
  );
}

function ReelFace({ slug, name, position }: { slug: string; name: string; position: string }) {
  return (
    <span className={styles.reelFace}>
      <PlayerHeadshot
        className={styles.reelAvatar}
        fallbackClassName={styles.reelAvatarFallback}
        imageClassName={styles.reelAvatarImage}
        name={name}
        position={position}
        slug={slug}
      />
      <span className={styles.reelName}>{name}</span>
    </span>
  );
}

function TradeSideFaces({ side }: { side: TradeFrame['send'] }) {
  return (
    <span className={styles.reelStack}>
      {side.map((player) => (
        <ReelFace key={player.slug} {...player} />
      ))}
    </span>
  );
}

function TradeCard() {
  const frame = TRADE_FRAMES[useReel(TRADE_FRAMES.length, 5600, 1800)];
  const band = getAcceptanceLingo(frame.acceptance);

  return (
    <article className={styles.boardCard}>
      <div className={styles.boardCardHead}>
        <span>{frame.partner}</span>
        {/* The motive is the argument. Acceptance odds are only credible if you
            can see what the other roster is missing. */}
        <span className={styles.boardMotive}>{frame.motive}</span>
      </div>
      {/* Two rows, not one wrapping line: packages are lopsided by nature
          (2-for-1, 1-for-2) and inline wrapping orphans the Get tag. */}
      <div className={styles.reelTrade} key={frame.partner}>
        <div className={styles.reelTradeRow}>
          <span className={styles.boardTag}>Send</span>
          <TradeSideFaces side={frame.send} />
        </div>
        <div className={styles.reelTradeRow}>
          <span className={styles.boardTagStart}>Get</span>
          <TradeSideFaces side={frame.get} />
        </div>
      </div>
      <div className={styles.boardAccept}>
        <div aria-hidden="true" className={styles.boardAcceptBar}>
          <span style={{ width: `${frame.acceptance}%` }} />
        </div>
        <span className={styles.boardAcceptLabel}>
          {formatAcceptancePercent(frame.acceptance)} they take it
          {' · '}
          {band?.label}
        </span>
      </div>
    </article>
  );
}

export function LandingPage() {
  return (
    <main className={styles.page}>
      {/* Two entries, one displayed. A phone gets the mark and two choices and
          nothing to scroll; a desktop has the room for the board to sell the
          product. Rendering both and hiding one is the only way to give each
          breakpoint the layout it actually wants, and display:none keeps the
          hidden copy out of the a11y tree. */}
      <div className={styles.mobileStage}>
        <img alt="Odds Gods" className={styles.mark} src={logo} />
        <h1 className={styles.wordmark}>Odds Gods</h1>
        <p className={styles.tagline}>Fantasy football, priced like a sportsbook.</p>
        <div className={styles.actions}>
          <a className={styles.primaryCta} href="/signin">Get started</a>
          <a className={styles.signInLink} href="/signin">
            Already have an account? <span>Sign in</span>
          </a>
        </div>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <img alt="Odds Gods" className={styles.heroLogo} src={logo} />
          <div className={styles.kicker}>FANTASY FOOTBALL · PRICED LIKE A SPORTSBOOK</div>
          <h1 className={styles.headline}>Every decision has a price.</h1>
          <p className={styles.sub}>
            Your league already argues about who is best. We simulate it ten
            thousand times a day and put a number on it.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.primaryCta} href="/signin">Get started</a>
            <a className={styles.signInLink} href="/signin">
              Already have an account? <span>Sign in</span>
            </a>
          </div>
          <div className={styles.proofStrip}>
            <span>Works with Sleeper and ESPN</span>
            <span className={styles.dot}>·</span>
            <span>10,000 season sims. 5,000 per matchup.</span>
          </div>
        </div>
        <DemoFutures />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionCopy}>
          <p className={styles.sectionKicker}>Trades</p>
          <h2 className={styles.sectionTitle}>He is not going to say yes to that.</h2>
          <p className={styles.sectionBody}>
            Every other trade tool grades your side. Ours reads the other
            roster, finds what it is actually short of, and tells you how
            likely that manager is to take the deal before you send it.
          </p>
        </div>
        <TradeCard />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionCopy}>
          <p className={styles.sectionKicker}>Your matchup</p>
          <h2 className={styles.sectionTitle}>The line moves all week.</h2>
          <p className={styles.sectionBody}>
            It opens Tuesday and re-prices on every projection refresh, every
            waiver run, every lineup change in the league. By Sunday you know
            exactly what moved you and by how much.
          </p>
        </div>
        <LineCard />
      </section>

      {/* Somebody who read to the bottom is the most convinced visitor on the
          page and the old one had nothing to press. */}
      <section className={styles.close}>
        <h2 className={styles.closeTitle}>What are your odds?</h2>
        <p className={styles.closeBody}>
          Connect a league and the board opens on your team in about a minute.
        </p>
        <a className={styles.primaryCta} href="/signin">Get started</a>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 Odds Gods</span>
      </footer>
    </main>
  );
}

export function DemoPage() {
  return (
    <div className={styles.demoShell}>
      <a className={styles.demoBanner} href="/signin">
        Demo league · Price your own league →
      </a>
      <MatchupPage />
    </div>
  );
}
