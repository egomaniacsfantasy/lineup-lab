import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthLanding.css';

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
        <section className="auth-landing__panel">
          <h1 className="auth-landing__wordmark">ODDS GODS</h1>
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
