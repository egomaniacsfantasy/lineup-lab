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

        {/* A book takes a game off the board when it is not taking action on
            it yet. It is the right phrase and it is ours, but it cannot be
            the only thing on the screen: the line under it has to leave
            nobody wondering whether something is broken. */}
        <h1 className="mobile-gate__headline">Off the board, for now.</h1>
        <p className="mobile-gate__copy">
          Odds Gods on a phone is coming. Until then it opens on a laptop or
          tablet, where the whole book fits on one screen.
        </p>

        <span className="mobile-gate__address">oddsgods.net</span>
      </main>
    </div>
  );
}
