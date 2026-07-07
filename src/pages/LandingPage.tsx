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

function ScoutingPersonaCard() {
  return (
    <article className={styles.personaCard} aria-label="Scouting read example">
      <div className={styles.personaHeader}>
        <span>Scouting read</span>
        <strong>Roster 4</strong>
      </div>
      <h2>The book has read your league.</h2>
      <div className={styles.meterStack}>
        {[
          ['Trade appetite', 23],
          ['Waiver aggression', 81],
          ['Reach tendency', 68],
        ].map(([label, value]) => (
          <div className={styles.meterRow} key={label}>
            <span>{label}</span>
            <code>{value}</code>
            <i style={{ width: `${value}%` }} />
          </div>
        ))}
      </div>
      <p className={styles.personaCopy}>
        Their guys: K. Williams, R. Rice. Needs RB. Trades move when acceptance clears the price.
      </p>
    </article>
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
            Odds Gods prices lineups, trades, futures, and draft spots against
            the people in your league.
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
        <ScoutingPersonaCard />
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
