import { useEffect, useState, type FormEvent } from 'react';
import { isEspnPluginRegistered } from '../utils/espnNativeAuth';
import { useAuth } from '../contexts/AuthContext';
import './AuthLanding.css';

declare const __BUILD_STAMP__: string | undefined;
const buildStamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev';

/**
 * What this device thinks its safe area is.
 *
 * The whole shell is laid out from env(safe-area-inset-top), and a browser
 * cannot answer whether that resolves in this WKWebView — env() is 0 in a
 * browser by definition, so measuring it there proves nothing either way. The
 * device has to say. This is the same reasoning as the build line beside it:
 * put the question that decides everything else on the one screen you can
 * reach without an account.
 */
function useViewportReadout() {
  const [readout, setReadout] = useState<string | null>(null);

  useEffect(() => {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:1px',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top)',
      'padding-bottom:env(safe-area-inset-bottom)',
    ].join(';');
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe);
    const env = Math.round(parseFloat(computed.paddingTop) || 0);
    const envBottom = Math.round(parseFloat(computed.paddingBottom) || 0);
    probe.remove();

    const pushed = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--shell-safe-top')
      .trim();

    setReadout(
      `env ${env}/${envBottom} · native ${pushed || 'none'} · ${window.innerWidth}x${window.innerHeight}`,
    );
  }, []);

  return readout;
}

export function AuthLanding() {
  const { signUp, signIn } = useAuth();
  const viewport = useViewportReadout();
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
          <img alt="" className="auth-landing__mark" src="/og-logo.png" />
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

          {/* The build line needs to be readable without an account. It was
              behind the tab bar, then behind the connect screen, and both of
              those need a login — so the one question worth asking first
              ("what is this device running?") could only be answered last. */}
          <p className="auth-landing__build">
            Build {buildStamp}
            {isEspnPluginRegistered() ? ' · native sign-in ready' : ''}
            {viewport ? ` · ${viewport}` : ''}
          </p>
        </section>
      </div>
    </div>
  );
}
