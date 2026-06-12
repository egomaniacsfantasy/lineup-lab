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

interface Preview {
  pendingId: string;
  tabs: PreviewTab[];
  totalRows: number;
  matchedCount: number;
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
  const [file, setFile] = useState<File | null>(null);
  const [pointsAre, setPointsAre] = useState<'per-game' | 'full-season'>('per-game');
  const [scoringBasis, setScoringBasis] = useState('ppr');
  const [preview, setPreview] = useState<Preview | null>(null);
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

  useEffect(() => {
    if (password) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    window.sessionStorage.setItem(PASSWORD_KEY, password);
    const ok = await loadHistory();
    if (!ok) setStatus('Wrong admin password.');
    else setStatus(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    setIsBusy(true);
    setStatus(null);

    const form = new FormData();
    form.append('file', file);
    form.append('pointsAre', pointsAre);
    form.append('scoringBasis', scoringBasis);

    try {
      const response = await adminFetch('/api/admin/projections/preview', {
        method: 'POST',
        body: form,
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.message ?? 'Preview failed.');
        return;
      }
      setPreview(body);
      setResolutions({});
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setIsBusy(true);

    try {
      const response = await adminFetch('/api/admin/projections/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId: preview.pendingId, resolutions }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus(body.message ?? 'Confirm failed.');
        return;
      }
      setStatus(
        `Imported ${body.count} projections as ${body.version}. All lines recompute automatically.`,
      );
      setPreview(null);
      setFile(null);
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
          <span>XLSX file (one tab per position)</span>
          <input
            accept=".xlsx"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFile(event.target.files?.[0] ?? null)
            }
            type="file"
          />
        </label>

        <div className="admin-projections__config">
          <label>
            Points are{' '}
            <select
              onChange={(event) =>
                setPointsAre(event.target.value as 'per-game' | 'full-season')
              }
              value={pointsAre}
            >
              <option value="per-game">per-game</option>
              <option value="full-season">full-season</option>
            </select>
          </label>
          <label>
            Scoring basis{' '}
            <select
              onChange={(event) => setScoringBasis(event.target.value)}
              value={scoringBasis}
            >
              <option value="ppr">PPR</option>
              <option value="half-ppr">Half PPR</option>
              <option value="standard">Standard</option>
            </select>
          </label>
        </div>

        <button
          className="admin-projections__primary"
          disabled={!file || isBusy}
          onClick={() => void handlePreview()}
          type="button"
        >
          {isBusy ? 'Parsing…' : 'Preview import'}
        </button>
      </section>

      {preview ? (
        <section className="admin-projections__card">
          <h2 className="admin-projections__subtitle">Preview</h2>
          <p className="admin-projections__summary">
            {preview.tabs.map((t) => `${t.tab}: ${t.rows}`).join(' · ')} —{' '}
            {preview.matchedCount} of {preview.totalRows} matched automatically.
          </p>

          {preview.unmatched.length > 0 ? (
            <div className="admin-projections__unmatched">
              <h3 className="admin-projections__subtitle">
                Needs review ({preview.unmatched.length})
              </h3>
              {preview.unmatched.map((row) => (
                <div className="admin-projections__unmatched-row" key={row.key}>
                  <span className="admin-projections__unmatched-name">
                    {row.name} ({row.position}
                    {row.team ? ` · ${row.team}` : ''})
                  </span>
                  <span className="admin-projections__candidates">
                    {row.candidates.length === 0 ? (
                      <em>No candidates — will be skipped</em>
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

          <button
            className="admin-projections__primary"
            disabled={isBusy}
            onClick={() => void handleConfirm()}
            type="button"
          >
            Confirm and activate
          </button>
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
