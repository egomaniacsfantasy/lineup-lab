import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import { useReel } from '../hooks/useReel';
import { formatAcceptancePercent, getAcceptanceLingo } from '../utils/acceptanceLingo';
import { formatAmericanOdds } from '../utils/formatOdds';
import {
  LINE_FRAMES,
  START_SIT_FRAMES,
  TRADE_FRAMES,
  type TradeFrame,
} from './landingReel';
import { MatchupPage } from './MatchupPage';
import styles from './LandingPage.module.css';

/* The three hero widgets play a reel of authored frames (see landingReel.ts).
   They are illustrative, not priced: nothing on this page computes anything.
   The cards run on different intervals so they never flip in unison, which is
   what makes a set of animated cards read as a machine rather than a market. */

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
          <span
            className={frame.move > 0 ? styles.boardTickerUp : styles.boardTickerDown}
          >
            {frame.move > 0 ? '▲' : '▼'} {Math.abs(frame.move).toFixed(1)}%
          </span>
        ) : null}
      </p>
    </article>
  );
}

function ReelFace({
  slug,
  name,
  position,
}: {
  slug: string;
  name: string;
  position: string;
}) {
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

function StartSitCard() {
  const frame = START_SIT_FRAMES[useReel(START_SIT_FRAMES.length, 4700, 900)];

  return (
    <article className={styles.boardCard}>
      <div className={styles.boardCardHead}>
        <span>Who do I start?</span>
        <span>{frame.sit.position}</span>
      </div>
      {/* Keyed on the frame, not the card: the content crossfades while the
          card itself persists, so the bars below can ease rather than jump. */}
      <div className={styles.reelSwap} key={frame.sit.slug}>
        <span className={styles.boardTag}>Sit</span>
        <ReelFace {...frame.sit} />
        <span aria-hidden="true" className={styles.boardArrow}>→</span>
        <span className={styles.boardTagStart}>Start</span>
        <ReelFace {...frame.start} />
      </div>
      <p className={styles.boardMove}>
        <s>{formatAmericanOdds(frame.beforeMoneyline)}</s>
        <span aria-hidden="true"> → </span>
        <strong>{formatAmericanOdds(frame.afterMoneyline)}</strong>
        <em>+{frame.delta.toFixed(1)}%</em>
      </p>
    </article>
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

  return (
    <article className={styles.boardCard}>
      <div className={styles.boardCardHead}>
        <span>Trade finder</span>
        <span>{frame.partner}</span>
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
          {getAcceptanceLingo(frame.acceptance)?.label}
        </span>
      </div>
    </article>
  );
}

function HeroBoard() {
  return (
    <div aria-label="What the book prices" className={styles.heroBoard}>
      <LineCard />
      <StartSitCard />
      <TradeCard />
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
          <h1 className={styles.headline}>Every decision has a price.</h1>
          <p className={styles.sub}>
            Connect your league and the book opens: your matchup as a
            moneyline, every start or sit as a probability swing, every trade
            with the odds the other manager actually says yes.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.primaryCta} href="/signin">Get started</a>
            <a className={styles.signInLink} href="/signin">
              Already have an account? <span>Sign in</span>
            </a>
          </div>
          <div className={styles.proofStrip}>
            <span>Built for Sleeper. Works with ESPN.</span>
            <span className={styles.dot}>·</span>
            <span>10,000 season sims. 5,000 per matchup.</span>
          </div>
        </div>
        <HeroBoard />
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
          <a className={styles.closeCta} href="/signin">Get started</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>ODDS GODS</strong>
        <span>© 2026 Odds Gods</span>
        <a href="/signin">Sign in</a>
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
