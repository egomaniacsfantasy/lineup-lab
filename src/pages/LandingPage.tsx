import logo from '../assets/og-logo.png';
import { MatchupPage } from './MatchupPage';
import styles from './LandingPage.module.css';

/**
 * Logged out.
 *
 * One screen, no scroll, nothing to read. The mark carries it, one line says
 * what this is, and there are exactly two things you can do. Everything else
 * that used to live here — the animated board cards, the markets grid, the
 * second CTA — was product demo aimed at someone who has not agreed to
 * anything yet, and it made the first impression feel like a brochure.
 */
export function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.stage}>
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
