import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordError } from '../../utils/diagnostics';
import './AppErrorBoundary.css';

interface Props {
  children: ReactNode;
  /** Supplied by the shell so the fallback can open the report dialog. */
  onReport: (prefill: string) => void;
}

interface State {
  error: Error | null;
}

/**
 * The white screen is the worst bug to receive a report about, because it is
 * the one where the reporter has the least to describe: everything vanished
 * and there is nothing on screen to point at. Catching the crash lets us put
 * the error text into the report ourselves and give them something to click
 * instead of a blank page.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* Into the same ring buffer the report reads from, so the component stack
       travels with it — that stack is usually the whole diagnosis. */
    recordError('error', error, `${error.stack ?? ''}\n${info.componentStack ?? ''}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-crash" role="alert">
        <div className="app-crash__panel">
          <p className="app-crash__kicker">That broke</p>
          <h1 className="app-crash__title">This screen stopped working.</h1>
          <p className="app-crash__copy">
            Not your fault, and nothing you did is lost. Send us what happened and we
            will have the error attached automatically.
          </p>
          <div className="app-crash__actions">
            <button
              className="app-crash__primary"
              onClick={() => this.props.onReport(`The ${window.location.pathname} screen went blank.`)}
              type="button"
            >
              Report this
            </button>
            <button
              className="app-crash__secondary"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload
            </button>
          </div>
          <p className="app-crash__detail">{error.message}</p>
        </div>
      </div>
    );
  }
}
