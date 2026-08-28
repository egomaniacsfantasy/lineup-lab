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
  return (
    <div className="mobile-gate">
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
        <h1 className="mobile-gate__headline">There&rsquo;s a book on your league.</h1>

        <ul className="mobile-gate__props">
          <li>Every matchup priced. Moneyline, spread and total.</li>
          <li>Championship odds for every team, moving all week.</li>
          <li>Trades worth making, priced from both sides.</li>
          <li>Call the rest of the season and watch the bracket move.</li>
          <li>Parlay your own league, at fair odds.</li>
        </ul>

        {/* "During the beta", not a flat "free". It is what the sign-up form
            already says, so the two cannot contradict each other, and it is
            the better line anyway: free that will not always be free. */}
        <p className="mobile-gate__free">All of it free during the beta.</p>

        <p className="mobile-gate__cta">Worth grabbing a laptop for.</p>
        <p className="mobile-gate__copy">
          Odds Gods opens on a laptop or tablet, where the whole book fits on
          one screen. The phone is coming.
        </p>

        <span className="mobile-gate__address">oddsgods.net</span>
      </main>
    </div>
  );
}
