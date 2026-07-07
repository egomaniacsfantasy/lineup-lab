import { AmbientCanvas } from '../components/matchup/AmbientCanvas';
import { useMatchupEngine } from '../hooks/useMatchupEngine';
import { MOCK_MATCHUP } from '../mocks';
import { formatAmericanOdds } from '../utils/formatOdds';
import { MatchupPage } from './MatchupPage';
import styles from './LandingPage.module.css';

function LiveLineCard() {
  const engine = useMatchupEngine(MOCK_MATCHUP);
  const yourLine = engine.activeLine.yours;
  const opponentLine = engine.activeLine.opponent;

  return (
    <a className={styles.liveCard} href="/demo">
      <div className={styles.liveCardHead}>
        <span>Week {MOCK_MATCHUP.week} · head-to-head</span>
        <span>Live demo line</span>
      </div>
      <div className={styles.liveFaceoff}>
        <div>
          <p className={styles.liveTeam}>{MOCK_MATCHUP.yourTeam.teamName}</p>
          <p className={styles.liveNumber}>{formatAmericanOdds(yourLine.moneyline)}</p>
          <p className={styles.liveMeta}>Proj {yourLine.projection.toFixed(1)} pts</p>
        </div>
        <span className={styles.liveVs}>VS</span>
        <div className={styles.liveOpponent}>
          <p className={styles.liveTeam}>{MOCK_MATCHUP.opponentTeam.teamName}</p>
          <p className={styles.liveNumber}>{formatAmericanOdds(opponentLine.moneyline)}</p>
          <p className={styles.liveMeta}>Proj {opponentLine.projection.toFixed(1)} pts</p>
        </div>
      </div>
      <div className={styles.liveBar} aria-hidden="true">
        <span style={{ width: `${yourLine.winProbability}%` }} />
      </div>
      <div className={styles.liveLabels}>
        <span>{yourLine.winProbability.toFixed(1)}% you</span>
        <span>{opponentLine.winProbability.toFixed(1)}% them</span>
      </div>
      <p className={styles.liveTap}>This is a real board from the demo league — tap through it.</p>
    </a>
  );
}

const beats = [
  {
    num: '01',
    title: 'Connect your league',
    body: 'Sleeper or ESPN. Thirty seconds, read-only, nothing changes in your league.',
  },
  {
    num: '02',
    title: 'We price everything',
    body: '10,000 simulations turn your roster into win probabilities, spreads, and futures.',
  },
  {
    num: '03',
    title: 'Make the priced move',
    body: 'Start/sit verdicts, trade prices, waiver values — every decision quoted before you make it.',
  },
];

const markets = [
  {
    stat: 'WIN PROB Δ +3.3%',
    title: 'Start/Sit verdicts',
    body: 'Tap two players. Get a priced answer, not a hot take.',
  },
  {
    stat: '23% TO ACCEPT',
    title: 'Trade pricing',
    body: 'Every trade quoted like a book would: fairness, acceptance odds, what it does to your title price.',
  },
  {
    stat: '+2400 → +1150',
    title: 'Season futures',
    body: 'Your playoff and championship odds, repriced after every move.',
  },
  {
    stat: 'PICK 7 · +650',
    title: 'Draft odds',
    body: 'Draft night, priced slot by slot — then share the receipt.',
  },
];

export function LandingPage() {
  return (
    <main className={styles.page}>
      <AmbientCanvas />
      <section className={styles.hero}>
        <div className={styles.kicker}>FANTASY FOOTBALL · PRICED LIKE A SPORTSBOOK</div>
        <h1 className={styles.headline}>Your lineup, priced.</h1>
        <p className={styles.sub}>
          Every start/sit call, every trade, every playoff path — run through
          10,000 Monte Carlo simulations and quoted as live odds. Your league,
          but with an honest book.
        </p>
        <div className={styles.ctaRow}>
          <a className={styles.primaryCta} href="/signin">Price my league</a>
          <a className={styles.secondaryCta} href="/demo">See a live board</a>
        </div>
        <div className={styles.proofStrip}>
          <span>10,000 simulations per decision</span>
          <span className={styles.dot}>·</span>
          <span>Works with Sleeper &amp; ESPN</span>
          <span className={styles.dot}>·</span>
          <span>From the team featured on Massey Ratings</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>THE PRODUCT</p>
          <h2>See the whole game priced.</h2>
        </div>
        <LiveLineCard />
      </section>

      <section className={styles.beats} aria-label="How it works">
        {beats.map((beat) => (
          <article className={styles.beat} key={beat.num}>
            <p className={styles.beatNum}>{beat.num}</p>
            <h3 className={styles.beatTitle}>{beat.title}</h3>
            <p className={styles.beatBody}>{beat.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>THE MARKETS</p>
          <h2>Every decision has a price.</h2>
        </div>
        <div className={styles.marketGrid}>
          {markets.map((market) => (
            <article className={styles.beat} key={market.title}>
              <p className={styles.marketStat}>
                {market.stat} <span>example</span>
              </p>
              <h3 className={styles.beatTitle}>{market.title}</h3>
              <p className={styles.beatBody}>{market.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.close}>
        <h2>The book is open.</h2>
        <div className={styles.ctaRow}>
          <a className={styles.closeCta} href="/signin">Price my league</a>
          <a className={styles.closeCta} href="/demo">See a live board</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>ODDS GODS</strong>
        <span>© 2026 Odds Gods</span>
        <a href="/signin">Sign in</a>
        <a href="/demo">Demo</a>
        <a href="/more">How this works</a>
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
