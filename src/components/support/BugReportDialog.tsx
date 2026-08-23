import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLeagueConnection } from '../../contexts/LeagueConnectionContext';
import { collectDiagnostics } from '../../utils/diagnostics';
import { captureScreen, screenCaptureSupported } from '../../utils/screenCapture';
import { submitBugReport } from '../../services/bugReport';
import './BugReportDialog.css';

type Phase = 'writing' | 'sending' | 'sent';

/**
 * The report form.
 *
 * The design principle is that the reporter should have to supply exactly one
 * thing — what went wrong in their own words — and everything else that makes
 * the report actionable is collected for them. What we collect is shown rather
 * than hidden, because a support form that quietly harvests state is a form
 * people stop trusting the second they find out.
 */
export function BugReportDialog({
  onClose,
  prefill = '',
}: {
  onClose: () => void;
  prefill?: string;
}) {
  const { user } = useAuth();
  const { stored, bootstrap } = useLeagueConnection();
  const [description, setDescription] = useState(prefill);
  const [phase, setPhase] = useState<Phase>('writing');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [shotNote, setShotNote] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* Read once when the dialog opens. Reading it live would mean the panel
     re-renders on every request the app makes behind it. */
  const diagnostics = useMemo(() => collectDiagnostics(), []);

  const failedRequests = diagnostics.requests.filter(
    (request) => request.status !== 200 && request.status !== 304,
  );

  const teamName =
    bootstrap && stored && String(bootstrap.league.id) === String(stored.leagueId)
      ? bootstrap.league.name
      : null;

  const onAttach = async () => {
    setShotNote(null);
    const result = await captureScreen();
    if (result.ok) {
      setScreenshot(result.dataUrl);
      setShotNote(null);
      return;
    }
    setShotNote(
      result.reason === 'declined'
        ? 'No picture attached. The report still works without one.'
        : result.reason === 'unsupported'
          ? "This browser can't attach a picture. Describe what you see instead."
          : "We couldn't grab that. Send it without a picture.",
    );
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!description.trim() || phase === 'sending') return;

    setPhase('sending');
    setError(null);
    const result = await submitBugReport({
      description,
      screenshot,
      provider: stored?.provider ?? null,
      leagueId: stored?.leagueId ?? null,
      leagueName: stored?.leagueName ?? null,
      teamName,
      email: user?.email ?? null,
    });

    if (result.ok) {
      setReference(result.reference ?? null);
      setPhase('sent');
      return;
    }
    /* Back to writing, with the text still in the box. Losing what someone
       typed because the network blipped is how you never get a second report
       out of that person. */
    setPhase('writing');
    setError(result.message ?? 'That did not send.');
  };

  if (phase === 'sent') {
    return (
      <div className="bug-report" role="dialog" aria-modal="true" aria-label="Report sent">
        <button className="bug-report__scrim" onClick={onClose} type="button" tabIndex={-1} aria-hidden="true" />
        <div className="bug-report__panel bug-report__panel--sent">
          <p className="bug-report__kicker">Sent</p>
          <h2 className="bug-report__title">We got it.</h2>
          {reference ? (
            <p className="bug-report__reference">
              Reference <strong>{reference}</strong>
            </p>
          ) : null}
          <p className="bug-report__copy">
            It came through with the page you were on, the league you had open, and
            anything that failed behind the scenes. No need to write any of that out.
          </p>
          <button className="bug-report__submit" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bug-report" role="dialog" aria-modal="true" aria-label="Report a bug">
      <button className="bug-report__scrim" onClick={onClose} type="button" tabIndex={-1} aria-hidden="true" />
      <form className="bug-report__panel" onSubmit={onSubmit}>
        <div className="bug-report__head">
          <div>
            <p className="bug-report__kicker">Something broken?</p>
            <h2 className="bug-report__title">Tell us what happened</h2>
          </div>
          <button
            aria-label="Close"
            className="bug-report__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <label className="bug-report__field">
          <span className="bug-report__label">In your own words</span>
          <textarea
            className="bug-report__textarea"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="I clicked my ESPN league and it disappeared."
            ref={textareaRef}
            rows={4}
            value={description}
          />
        </label>

        <div className="bug-report__attach">
          {screenshot ? (
            <div className="bug-report__thumb-row">
              <img alt="Attached screenshot" className="bug-report__thumb" src={screenshot} />
              <button
                className="bug-report__link"
                onClick={() => setScreenshot(null)}
                type="button"
              >
                Remove picture
              </button>
            </div>
          ) : (
            <button
              className="bug-report__attach-button"
              disabled={!screenCaptureSupported()}
              onClick={onAttach}
              type="button"
            >
              Add a picture of your screen
            </button>
          )}
          {shotNote ? <p className="bug-report__note">{shotNote}</p> : null}
        </div>

        {/* Everything below is collected automatically. It is shown, not
            hidden, so nobody discovers later what a support form was sending. */}
        <div className="bug-report__auto">
          <button
            aria-expanded={showDetail}
            className="bug-report__link"
            onClick={() => setShowDetail((v) => !v)}
            type="button"
          >
            {showDetail ? 'Hide' : 'Show'} what gets sent with this
          </button>
          <p className="bug-report__summary">
            Page, league, app version
            {failedRequests.length > 0
              ? `, and ${failedRequests.length} failed request${failedRequests.length === 1 ? '' : 's'}`
              : ''}
            {diagnostics.errors.length > 0
              ? `, ${diagnostics.errors.length} error${diagnostics.errors.length === 1 ? '' : 's'}`
              : ''}
            .
          </p>
          {showDetail ? (
            <dl className="bug-report__detail">
              <div>
                <dt>Page</dt>
                <dd>{diagnostics.route}</dd>
              </div>
              <div>
                <dt>League</dt>
                <dd>
                  {stored
                    ? `${stored.leagueName ?? stored.leagueId} (${stored.provider})`
                    : 'none open'}
                </dd>
              </div>
              <div>
                <dt>App version</dt>
                <dd>{diagnostics.build}</dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>{diagnostics.viewport}</dd>
              </div>
              {failedRequests.length > 0 ? (
                <div>
                  <dt>Failed</dt>
                  <dd>
                    {failedRequests.slice(-4).map((request) => (
                      <span className="bug-report__row" key={`${request.at}-${request.url}`}>
                        {request.status} · {request.url}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {diagnostics.errors.length > 0 ? (
                <div>
                  <dt>Errors</dt>
                  <dd>
                    {diagnostics.errors.slice(-3).map((entry, index) => (
                      <span className="bug-report__row" key={`${entry.at}-${index}`}>
                        {entry.message.slice(0, 120)}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Not sent</dt>
                <dd>Your password, your ESPN cookies, anything you typed elsewhere.</dd>
              </div>
            </dl>
          ) : null}
        </div>

        {error ? <p className="bug-report__error">{error}</p> : null}

        <button
          className="bug-report__submit"
          disabled={!description.trim() || phase === 'sending'}
          type="submit"
        >
          {phase === 'sending' ? 'Sending…' : 'Send report'}
        </button>
      </form>
    </div>
  );
}
