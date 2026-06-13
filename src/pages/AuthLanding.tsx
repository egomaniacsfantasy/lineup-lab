/**
 * The front door for anyone not logged in: previews the thesis and features,
 * with sign up / log in. You can't reach the app without an account.
 */
import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthLanding.css';

const FEATURES = [
  {
    title: 'Who do I start',
    body: 'Tap two players, see the exact win-probability swing. The math, not a hunch.',
  },
  {
    title: 'Trade command center',
    body: 'Deals both sides should take, plus an honest accept-or-decline read on any offer.',
  },
  {
    title: 'Season futures',
    body: 'Live title odds, playoff and finals probabilities, week by week.',
  },
];

/** A static taste of the real matchup card, to show what they're signing up for. */
function MatchupPreview() {
  return (
    <div className="auth-preview" aria-hidden="true">
      <div className="auth-preview__head">
        <span className="auth-preview__eyebrow">Week 1 · head to head</span>
        <span className="auth-preview__live">
          <span className="auth-preview__dot" />
          Live line
        </span>
      </div>
      <div className="auth-preview__faceoff">
        <div className="auth-preview__side">
          <p className="auth-preview__team">Your team</p>
          <p className="auth-preview__ml">+154</p>
          <p className="auth-preview__proj">Proj 128.4</p>
        </div>
        <span className="auth-preview__vs">VS</span>
        <div className="auth-preview__side auth-preview__side--opp">
          <p className="auth-preview__team">Roster 4</p>
          <p className="auth-preview__ml auth-preview__ml--opp">−154</p>
          <p className="auth-preview__proj">Proj 135.7</p>
        </div>
      </div>
      <div className="auth-preview__bar">
        <span className="auth-preview__bar-fill" style={{ width: '39.8%' }} />
      </div>
      <div className="auth-preview__labels">
        <span className="auth-preview__label-you">39.8% you</span>
        <span>60.2% them</span>
      </div>
      <div className="auth-preview__meta">
        <span>Spread <b>You +7.4</b></span>
        <span>Total <b>264.1</b></span>
      </div>
    </div>
  );
}

export function AuthLanding() {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: authError } =
      mode === 'signup' ? await signUp(email, password) : await signIn(email, password);
    if (authError) {
      setError(authError);
      setBusy(false);
    }
    // On success the auth listener swaps the app in; no navigation needed.
  };

  return (
    <div className="auth-landing">
      <div className="auth-landing__inner">
        <section className="auth-landing__pitch">
          <p className="auth-landing__kicker">Odds Gods</p>
          <h1 className="auth-landing__wordmark">OLYMPUS</h1>
          <p className="auth-landing__thesis">
            Your fantasy league, priced like a sportsbook. Sync once and every
            matchup, start-sit, and trade gets a real number behind it.
          </p>
          <MatchupPreview />
          <ul className="auth-landing__features">
            {FEATURES.map((feature) => (
              <li className="auth-landing__feature" key={feature.title}>
                <span className="auth-landing__feature-title">{feature.title}</span>
                <span className="auth-landing__feature-body">{feature.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="auth-landing__panel">
          <div className="auth-landing__tabs" role="tablist">
            <button
              aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'auth-landing__tab auth-landing__tab--on' : 'auth-landing__tab'}
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              role="tab"
              type="button"
            >
              Create account
            </button>
            <button
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'auth-landing__tab auth-landing__tab--on' : 'auth-landing__tab'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              role="tab"
              type="button"
            >
              Log in
            </button>
          </div>

          <form className="auth-landing__form" onSubmit={submit}>
            <label className="auth-landing__field">
              <span className="auth-landing__label">Email</span>
              <input
                autoComplete="email"
                className="auth-landing__input"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@email.com"
                type="email"
                value={email}
              />
            </label>
            <label className="auth-landing__field">
              <span className="auth-landing__label">Password</span>
              <input
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="auth-landing__input"
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                type="password"
                value={password}
              />
            </label>

            {error ? <p className="auth-landing__error">{error}</p> : null}

            <button
              className="auth-landing__submit"
              disabled={busy || !email || !password}
              type="submit"
            >
              {busy
                ? 'One sec…'
                : mode === 'signup'
                  ? 'Create my account'
                  : 'Log in'}
            </button>
          </form>

          <p className="auth-landing__fineprint">
            {mode === 'signup'
              ? 'Free during the beta. One account, all your leagues.'
              : 'Welcome back. Your leagues are waiting.'}
          </p>
        </section>
      </div>
    </div>
  );
}
