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
      <p className={styles.liveTap}>This is a real board from the demo league. Tap through it.</p>
    </a>
  );
}

/* Three miniatures of the real product, with the demo league's numbers.
   Static marketing copy: nothing here is computed. */
function HeroBoard() {
  return (
    <div aria-label="What the book prices" className={styles.heroBoard}>
      <article className={styles.boardCard}>
        <div className={styles.boardCardHead}>
          <span>Week 8 · head-to-head</span>
          <span className={styles.boardLive}>Live line</span>
        </div>
        <div className={styles.boardFaceoff}>
          <div>
            <p className={styles.boardTeam}>Zeus&apos;s Bolts</p>
            <p className={styles.boardNumber}>-159</p>
          </div>
          <span className={styles.boardVs}>VS</span>
          <div className={styles.boardFaceoffRight}>
            <p className={styles.boardTeam}>Hermes Express</p>
            <p className={styles.boardNumberDim}>+134</p>
          </div>
        </div>
        <div aria-hidden="true" className={styles.boardBar}>
          <span style={{ width: '61.4%' }} />
        </div>
        <div className={styles.boardBarLabels}>
          <span>61.4% you</span>
          <span>38.6% them</span>
        </div>
      </article>

      <article className={styles.boardCard}>
        <div className={styles.boardCardHead}>
          <span>Who do I start?</span>
        </div>
        <p className={styles.boardSwap}>
          <span className={styles.boardTag}>Sit</span> T. McLaurin
          <span aria-hidden="true" className={styles.boardArrow}> → </span>
          <span className={styles.boardTagStart}>Start</span> D. Smith
        </p>
        <p className={styles.boardMove}>
          <s>-159</s>
          <span aria-hidden="true"> → </span>
          <strong>-182</strong>
          <em>+3.2%</em>
        </p>
      </article>

      <article className={styles.boardCard}>
        <div className={styles.boardCardHead}>
          <span>Trade finder</span>
        </div>
        <p className={styles.boardSwap}>
          <span className={styles.boardTag}>Send</span> Kelce + Aubrey
          <span aria-hidden="true" className={styles.boardArrow}> → </span>
          <span className={styles.boardTagStart}>Get</span> McBride + Nacua
        </p>
        <div className={styles.boardAccept}>
          <div aria-hidden="true" className={styles.boardAcceptBar}>
            <span style={{ width: '48%' }} />
          </div>
          <span className={styles.boardAcceptLabel}>48% they take it · Coin flip</span>
        </div>
      </article>
    </div>
  );
}

const markets = [
  {
    stat: 'FLOOR · MEDIAN · CEILING',
    title: 'Verdicts that know the score',
    body: 'Start/sit calls with range, matchup, and game-state context.',
  },
  {
    stat: '23% TO ACCEPT',
    title: 'Trade pricing against the actual human',
    body: 'Fairness, title movement, and acceptance tied to the manager across from you.',
  },
  {
    stat: 'PICK 4 · 31.2%',
    title: 'Draft odds',
    body: 'Slot odds, player availability, and a shareable receipt.',
  },
];

export function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}>FANTASY FOOTBALL · PRICED LIKE A SPORTSBOOK</div>
          <h1 className={styles.headline}>Your league has a line.</h1>
          <p className={styles.sub}>
            Connect your league and every decision gets a price: your matchup
            as a moneyline, start or sit as a probability swing, trades with
            the odds the other manager says yes.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.primaryCta} href="/signin">Price my league</a>
            <a className={styles.secondaryCta} href="/demo">See a live board</a>
          </div>
          <div className={styles.proofStrip}>
            <span>Built for Sleeper. Works with ESPN.</span>
            <span className={styles.dot}>·</span>
            <span>10,000 simulations per decision</span>
          </div>
        </div>
        <HeroBoard />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>LIVE DEMO</p>
          <h2>The board is real.</h2>
        </div>
        <LiveLineCard />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <p className={styles.sectionKicker}>THE MARKETS</p>
          <h2>Every decision gets a number.</h2>
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
        <a href="/demo">How this works</a>
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
