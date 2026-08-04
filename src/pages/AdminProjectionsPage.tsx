/**
 * Owner-only projections admin (/admin/projections). The owner's input
 * point for Franco's XLSX — drop file, resolve unmatched, confirm.
 * Protected by ADMIN_PASSWORD on the server; no user system in v1.
 */
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { SeasonalNotice } from '../components/layout/SeasonalNotice';
import './AdminProjectionsPage.css';

interface PreviewTab {
  tab: string;
  position: string;
  rows: number;
}

interface UnmatchedRow {
  key: string;
  name: string;
  team: string | null;
  position: string;
  candidates: { id: string; name: string; team: string | null; score: number }[];
}

interface ImportResult {
  version: string;
  count: number;
  tabs: PreviewTab[];
  unmatched: UnmatchedRow[];
}

interface VersionRow {
  version: string;
  scoringBasis: string;
  pointsAre: string;
  count: number;
  importedAt: number;
}

const PASSWORD_KEY = 'og.olympus.admin-password';

export function AdminProjectionsPage() {
  const [password, setPassword] = useState(
    () => window.sessionStorage.getItem(PASSWORD_KEY) ?? '',
  );
  const [isAuthed, setIsAuthed] = useState(false);
  const [history, setHistory] = useState<{ active: string | null; versions: VersionRow[] } | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const adminFetch = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(path, {
        ...init,
        headers: { ...(init.headers ?? {}), 'x-admin-password': password },
      }),
    [password],
  );

  const loadHistory = useCallback(async () => {
    const response = await adminFetch('/api/admin/projections');
    if (response.status === 401) {
      setIsAuthed(false);
      return false;
    }
    setHistory(await response.json());
    setIsAuthed(true);
    return true;
  }, [adminFetch]);

  const [live, setLive] = useState<{ on: boolean; at: number; leagues?: number }>({
    on: false,
    at: 0,
  });

  const refreshLive = useCallback(async () => {
    try {
      const res = await fetch('/api/live/status');
      if (res.ok) setLive(await res.json());
    } catch {
      // best effort
    }
  }, []);

  const toggleLive = async () => {
    setIsBusy(true);
    try {
      const res = await adminFetch('/api/admin/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: !live.on }),
      });
      if (!res.ok) {
        setStatus(res.status === 401 ? 'Wrong admin password.' : 'Could not toggle live mode.');
        return;
      }
      const body = await res.json();
      setLive(body);
      setStatus(
        body.on
          ? 'Live mode ON: matchup win% and futures refresh every 30s during games.'
          : 'Live mode OFF: back to the static price.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (password) {
      void loadHistory();
      void refreshLive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    window.sessionStorage.setItem(PASSWORD_KEY, password);
    const ok = await loadHistory();
    if (!ok) setStatus('Wrong admin password.');
    else setStatus(null);
  };

  const handleImport = async () => {
    if (files.length === 0) return;
    setIsBusy(true);
    setStatus(null);

    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    if (Object.keys(resolutions).length > 0) {
      form.append('resolutions', JSON.stringify(resolutions));
    }

    try {
      const response = await adminFetch('/api/admin/projections/import-franco', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.message ?? 'Import failed.');
        return;
      }
      setResult(body);
      setResolutions({});
      setStatus(
        body.unmatched.length === 0
          ? `Imported ${body.count} projections as ${body.version} and activated. All lines reprice automatically.`
          : `Imported ${body.count} projections as ${body.version}. ${body.unmatched.length} unmatched. Pick the right player below and re-import.`,
      );
      await loadHistory();
    } finally {
      setIsBusy(false);
    }
  };

  const handleActivate = async (version: string) => {
    setIsBusy(true);
    try {
      await adminFetch('/api/admin/projections/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      });
      setStatus(`Rolled back to ${version}. Lines recompute automatically.`);
      await loadHistory();
    } finally {
      setIsBusy(false);
    }
  };

  // Live reprice: after a game wave ends, lock finished players to their real
  // score and re-sim every league. Safe to press anytime — off-season it just
  // reprices with no players locked.
  const handleReprice = async () => {
    setIsBusy(true);
    setStatus('Repricing all leagues with live results…');
    try {
      const response = await adminFetch('/api/admin/reprice', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.message ?? 'Reprice failed.');
        return;
      }
      const finals = (body.finalTeams ?? []).length;
      setStatus(
        `Repriced ${body.ok}/${body.total} leagues. ${finals} team${finals === 1 ? '' : 's'} currently final: their players are locked to live scores.`,
      );
    } finally {
      setIsBusy(false);
    }
  };

  if (!isAuthed) {
    return (
      <div className="admin-projections">
        <p className="admin-projections__kicker">Projections admin</p>
        <h1 className="admin-projections__title">Owner sign-in</h1>
        <form
          className="admin-projections__login"
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin();
          }}
        >
          <input
            className="admin-projections__input"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            type="password"
            value={password}
          />
          <button className="admin-projections__primary" type="submit">
            Sign in
          </button>
        </form>
        {status ? <SeasonalNotice>{status}</SeasonalNotice> : null}
      </div>
    );
  }

  return (
    <div className="admin-projections">
      <p className="admin-projections__kicker">Projections admin</p>
      <h1 className="admin-projections__title">Import Franco&apos;s sheet</h1>

      {status ? <SeasonalNotice>{status}</SeasonalNotice> : null}

      <section className="admin-projections__card">
        <label className="admin-projections__field">
          <span>
            Drop all position files at once (qb / rb / wr / te / kicker /
            def *_combined.xlsx). Scoring is PPR; the per-week game_level
            sheets drive every line.
          </span>
          <input
            accept=".xlsx"
            multiple
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFiles(Array.from(event.target.files ?? []))
            }
            type="file"
          />
        </label>

        {files.length > 0 ? (
          <p className="admin-projections__summary">
            {files.length} file{files.length === 1 ? '' : 's'} selected:{' '}
            {files.map((file) => file.name).join(', ')}
          </p>
        ) : null}

        <button
          className="admin-projections__primary"
          disabled={files.length === 0 || isBusy}
          onClick={() => void handleImport()}
          type="button"
        >
          {isBusy
            ? 'Importing…'
            : Object.keys(resolutions).length > 0
              ? 'Re-import with confirmed matches'
              : 'Import and activate'}
        </button>
      </section>

      <section className="admin-projections__card">
        <h2 className="admin-projections__subtitle">
          Live mode {live.on ? <span style={{ color: '#2fd47a' }}>ON</span> : <span style={{ opacity: 0.6 }}>off</span>}
        </h2>
        <p className="admin-projections__summary">
          Flip this ON before a game window. Every 30s it reads the NFL scoreboard
          once and refreshes every league's live matchup win% and futures (playoff
          and title odds) from the game clock. Flip it OFF when games are done and
          everything reverts to the static price.
          {live.on && live.leagues != null ? ` Currently updating ${live.leagues} league${live.leagues === 1 ? '' : 's'}.` : ''}
        </p>
        <button
          className="admin-projections__primary"
          disabled={isBusy}
          onClick={() => void toggleLive()}
          type="button"
        >
          {isBusy ? 'Working…' : live.on ? 'Turn live mode OFF' : 'Turn live mode ON'}
        </button>
      </section>

      <section className="admin-projections__card">
        <h2 className="admin-projections__subtitle">Live reprice</h2>
        <p className="admin-projections__summary">
          After a game wave ends, press this to lock every finished player to their
          real score and re-sim all leagues (matchup, playoff and title odds). Safe
          anytime: off-season it just reprices with nothing locked.
        </p>
        <button
          className="admin-projections__primary"
          disabled={isBusy}
          onClick={() => void handleReprice()}
          type="button"
        >
          {isBusy ? 'Repricing…' : 'Reprice all leagues (live)'}
        </button>
      </section>

      {result ? (
        <section className="admin-projections__card">
          <h2 className="admin-projections__subtitle">Last import</h2>
          <p className="admin-projections__summary">
            {result.tabs.map((t) => `${t.position ?? t.tab}: ${t.rows}`).join(' · ')}.{' '}
            {result.count} imported as <strong>{result.version}</strong>.
          </p>

          {result.unmatched.length > 0 ? (
            <div className="admin-projections__unmatched">
              <h3 className="admin-projections__subtitle">
                Needs review ({result.unmatched.length}): pick the right
                player, then re-import the same files
              </h3>
              {result.unmatched.map((row) => (
                <div className="admin-projections__unmatched-row" key={row.key}>
                  <span className="admin-projections__unmatched-name">
                    {row.name} ({row.position}
                    {row.team ? ` · ${row.team}` : ''})
                  </span>
                  <span className="admin-projections__candidates">
                    {row.candidates.length === 0 ? (
                      <em>No candidates, will be skipped</em>
                    ) : (
                      row.candidates.map((candidate) => (
                        <button
                          className={[
                            'admin-projections__candidate',
                            resolutions[row.key] === candidate.id
                              ? 'admin-projections__candidate--selected'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          key={candidate.id}
                          onClick={() =>
                            setResolutions((current) => ({
                              ...current,
                              [row.key]: candidate.id,
                            }))
                          }
                          type="button"
                        >
                          {candidate.name}
                          {candidate.team ? ` (${candidate.team})` : ''}
                        </button>
                      ))
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="admin-projections__card">
        <h2 className="admin-projections__subtitle">Import history</h2>
        {history && history.versions.length > 0 ? (
          history.versions.map((version) => (
            <div className="admin-projections__version" key={version.version}>
              <span>
                <strong>{version.version}</strong> · {version.count} players ·{' '}
                {version.scoringBasis.toUpperCase()} ·{' '}
                {new Date(version.importedAt).toLocaleString()}
                {history.active === version.version ? (
                  <span className="admin-projections__active-chip">Active</span>
                ) : null}
              </span>
              {history.active !== version.version ? (
                <button
                  className="admin-projections__rollback"
                  disabled={isBusy}
                  onClick={() => void handleActivate(version.version)}
                  type="button"
                >
                  Roll back to this
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="admin-projections__summary">No imports yet.</p>
        )}
      </section>
    </div>
  );
}
