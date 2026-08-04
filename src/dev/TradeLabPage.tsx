/**
 * DEV ONLY. Three genuinely different structures for the deal card, rendered
 * from one set of deals so they can be compared honestly rather than
 * described. Not routed in production and not imported by the app.
 *
 * The brief that produced this: three rounds of "flat", "a ton of empty
 * space", "start from scratch". Rearranging inside a full-width card never
 * addressed the actual cause, which is that one deal does not have enough
 * content to justify 1386px. Two of the three below fix that structurally.
 *
 * Numbers are authored here and mirror the shape the engine serves. Nothing
 * on this page computes anything.
 */
import { PlayerHeadshot } from '../components/player/PlayerHeadshot';
import styles from './TradeLab.module.css';

interface LabPlayer {
  slug: string;
  name: string;
  pos: string;
  team: string;
}

interface LabDeal {
  id: string;
  verdict: string;
  tone: 'good' | 'neutral' | 'bad';
  title: number;
  titleThem: number;
  playoffs: number;
  playoffsThem: number;
  week: number;
  weekThem: number;
  accept: number;
  band: string;
  partner: string;
  send: LabPlayer[];
  get: LabPlayer[];
}

const DEALS: LabDeal[] = [
  {
    id: 'a',
    verdict: 'Good value',
    tone: 'good',
    title: 1.9,
    titleThem: -0.1,
    playoffs: 4.4,
    playoffsThem: 0,
    week: -2.3,
    weekThem: 1.9,
    accept: 39,
    band: 'Doubtful',
    partner: 'Hermes Express',
    send: [
      { slug: 'p-mahomes', name: 'P. Mahomes', pos: 'QB', team: 'KC' },
      { slug: 'c-lamb', name: 'C. Lamb', pos: 'WR', team: 'DAL' },
      { slug: 'j-jacobs', name: 'J. Jacobs', pos: 'RB', team: 'GB' },
    ],
    get: [
      { slug: 'j-burrow', name: 'J. Burrow', pos: 'QB', team: 'CIN' },
      { slug: 'j-gibbs', name: 'J. Gibbs', pos: 'RB', team: 'DET' },
      { slug: 'j-chase', name: 'J. Chase', pos: 'WR', team: 'CIN' },
    ],
  },
  {
    id: 'b',
    verdict: 'Fair',
    tone: 'neutral',
    title: 0.4,
    titleThem: -0.2,
    playoffs: 0.6,
    playoffsThem: -0.3,
    week: -0.9,
    weekThem: 0.7,
    accept: 71,
    band: 'Favored',
    partner: 'Apollo Archers',
    send: [{ slug: 'c-lamb', name: 'C. Lamb', pos: 'WR', team: 'DAL' }],
    get: [{ slug: 'j-gibbs', name: 'J. Gibbs', pos: 'RB', team: 'DET' }],
  },
  {
    id: 'c',
    verdict: 'Overpay',
    tone: 'bad',
    title: -2.7,
    titleThem: 1.9,
    playoffs: -3.4,
    playoffsThem: 2.6,
    week: -1.8,
    weekThem: 1.5,
    accept: 70,
    band: 'Favored',
    partner: 'Poseidon Waves',
    send: [
      { slug: 'b-robinson', name: 'B. Robinson', pos: 'RB', team: 'ATL' },
      { slug: 't-kelce', name: 'T. Kelce', pos: 'TE', team: 'KC' },
    ],
    get: [{ slug: 'j-jefferson', name: 'J. Jefferson', pos: 'WR', team: 'MIN' }],
  },
];

const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
const signClass = (v: number) => (v > 0 ? styles.pos : v < 0 ? styles.neg : styles.flat);

function Face({ p, size = 'md' }: { p: LabPlayer; size?: 'sm' | 'md' }) {
  return (
    <PlayerHeadshot
      className={size === 'sm' ? styles.faceSm : styles.face}
      fallbackClassName={styles.faceFallback}
      imageClassName={styles.faceImg}
      name={p.name}
      position={p.pos}
      slug={p.slug}
    />
  );
}

/* ── A. Odds board row ──────────────────────────────────────────────────────
   The book's board. One dense line per deal, scanned vertically like a
   sportsbook wall. Kills the horizontal void by refusing to be tall. */
function BoardRow({ d }: { d: LabDeal }) {
  return (
    <article className={styles.row}>
      <div className={styles.rowVerdict}>
        <span className={[styles.rowWord, styles[d.tone]].join(' ')}>{d.verdict}</span>
        <span className={[styles.rowTitle, signClass(d.title)].join(' ')}>{pct(d.title)}</span>
      </div>
      <div className={styles.rowSwap}>
        {d.send.map((p) => (
          <span className={styles.chip} key={`s-${p.slug}`}>
            <Face p={p} size="sm" />
            {p.name}
          </span>
        ))}
        <span aria-hidden="true" className={styles.rowArrow}>→</span>
        {d.get.map((p) => (
          <span className={[styles.chip, styles.chipGet].join(' ')} key={`g-${p.slug}`}>
            <Face p={p} size="sm" />
            {p.name}
          </span>
        ))}
      </div>
      <div className={styles.rowStats}>
        <span><i>Playoffs</i><b className={signClass(d.playoffs)}>{pct(d.playoffs)}</b></span>
        <span><i>Week</i><b className={signClass(d.week)}>{pct(d.week)}</b></span>
      </div>
      <div className={styles.rowAccept}>
        <span className={styles.rowAcceptPct}>{d.accept}%</span>
        <span className={styles.rowAcceptBand}>{d.band}</span>
      </div>
    </article>
  );
}

/* ── B. Ticket ──────────────────────────────────────────────────────────────
   A betslip. Narrow portrait cards in a grid, so three deals sit side by side
   and no card is ever wider than its content. */
function Ticket({ d }: { d: LabDeal }) {
  return (
    <article className={styles.ticket}>
      <header className={[styles.ticketHead, styles[`head_${d.tone}`]].join(' ')}>
        <span className={styles.ticketWord}>{d.verdict}</span>
        <span className={[styles.ticketTitle, signClass(d.title)].join(' ')}>{pct(d.title)}</span>
        <span className={styles.ticketTitleLabel}>your title · them {pct(d.titleThem)}</span>
      </header>

      <div className={styles.ticketBody}>
        <span className={styles.ticketEyebrow}>You send</span>
        {d.send.map((p) => (
          <div className={styles.ticketLine} key={`s-${p.slug}`}>
            <Face p={p} />
            <span className={styles.ticketName}>{p.name}</span>
            <span className={styles.ticketMeta}>{p.pos} · {p.team}</span>
          </div>
        ))}
        <div className={styles.ticketRule}><span>for</span></div>
        <span className={styles.ticketEyebrow}>You get</span>
        {d.get.map((p) => (
          <div className={styles.ticketLine} key={`g-${p.slug}`}>
            <Face p={p} />
            <span className={styles.ticketName}>{p.name}</span>
            <span className={styles.ticketMeta}>{p.pos} · {p.team}</span>
          </div>
        ))}
      </div>

      <div className={styles.ticketStats}>
        <span><i>Playoffs</i><b className={signClass(d.playoffs)}>{pct(d.playoffs)}</b></span>
        <span><i>This week</i><b className={signClass(d.week)}>{pct(d.week)}</b></span>
      </div>

      <footer className={styles.ticketFoot}>
        <div className={styles.ticketAcceptRow}>
          <span className={styles.ticketAcceptPct}>{d.accept}%</span>
          <span className={styles.ticketAcceptBand}>{d.band} to accept</span>
        </div>
        <div className={styles.ticketBar}><span style={{ width: `${d.accept}%` }} /></div>
      </footer>
    </article>
  );
}

/* ── C. Marquee ─────────────────────────────────────────────────────────────
   Full width earned rather than assumed: the verdict becomes a scoreboard
   that fills the left half at display scale, so nothing is stranded. */
function Marquee({ d }: { d: LabDeal }) {
  return (
    <article className={styles.marquee}>
      <div className={styles.mqLeft}>
        <span className={[styles.mqWord, styles[d.tone]].join(' ')}>{d.verdict}</span>
        <span className={[styles.mqTitle, signClass(d.title)].join(' ')}>{pct(d.title)}</span>
        <span className={styles.mqLabel}>your title odds · them {pct(d.titleThem)}</span>
        <div className={styles.mqStats}>
          <span><i>Playoffs</i><b className={signClass(d.playoffs)}>{pct(d.playoffs)}</b><em>them {pct(d.playoffsThem)}</em></span>
          <span><i>This week</i><b className={signClass(d.week)}>{pct(d.week)}</b><em>them {pct(d.weekThem)}</em></span>
        </div>
      </div>

      <div className={styles.mqRight}>
        <div className={styles.mqCols}>
          <div>
            <span className={styles.ticketEyebrow}>You send</span>
            {d.send.map((p) => (
              <div className={styles.ticketLine} key={`s-${p.slug}`}>
                <Face p={p} />
                <span className={styles.ticketName}>{p.name}</span>
                <span className={styles.ticketMeta}>{p.pos} · {p.team}</span>
              </div>
            ))}
          </div>
          <div>
            <span className={styles.ticketEyebrow}>You get</span>
            {d.get.map((p) => (
              <div className={styles.ticketLine} key={`g-${p.slug}`}>
                <Face p={p} />
                <span className={styles.ticketName}>{p.name}</span>
                <span className={styles.ticketMeta}>{p.pos} · {p.team}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.mqAccept}>
          <span className={styles.mqAcceptPct}>{d.accept}%</span>
          <span className={styles.mqAcceptBand}>{d.band} to accept</span>
          <div className={styles.ticketBar}><span style={{ width: `${d.accept}%` }} /></div>
        </div>
      </div>
    </article>
  );
}

export function TradeLabPage() {
  return (
    <main className={styles.page}>
      <section className={styles.block}>
        <h2 className={styles.h}>A · Odds board</h2>
        <p className={styles.sub}>
          One line per deal. Scans like a sportsbook wall, shows many deals at
          once, and cannot be empty because it is never tall.
        </p>
        <div className={styles.rows}>
          {DEALS.map((d) => <BoardRow d={d} key={d.id} />)}
        </div>
      </section>

      <section className={styles.block}>
        <h2 className={styles.h}>B · Ticket</h2>
        <p className={styles.sub}>
          A betslip. Narrow cards in a grid, so a card is never wider than its
          content and three deals compare side by side.
        </p>
        <div className={styles.tickets}>
          {DEALS.map((d) => <Ticket d={d} key={d.id} />)}
        </div>
      </section>

      <section className={styles.block}>
        <h2 className={styles.h}>C · Marquee</h2>
        <p className={styles.sub}>
          Keeps the full width but earns it: the verdict becomes a scoreboard
          at display scale instead of a caption in a gutter.
        </p>
        <div className={styles.rows}>
          {DEALS.map((d) => <Marquee d={d} key={d.id} />)}
        </div>
      </section>
    </main>
  );
}
