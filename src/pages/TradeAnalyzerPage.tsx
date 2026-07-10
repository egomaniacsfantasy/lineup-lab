import { useMemo, useState } from 'react';
import { useLeagueConnection } from '../contexts/LeagueConnectionContext';
import { analyzeTradeApi, type TradeAnalysis, type TradeSideDelta } from '../services/leagueApi';

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

export function TradeAnalyzerPage() {
  const { bootstrap, stored } = useLeagueConnection();
  const userTeam = bootstrap?.teams.find((t) => t.isUser) ?? null;
  const partners = useMemo(
    () => (bootstrap ? bootstrap.teams.filter((t) => !t.isUser) : []),
    [bootstrap],
  );
  const [partnerRosterId, setPartnerRosterId] = useState<number | null>(null);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [getP, setGetP] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<TradeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drops, setDrops] = useState<string[] | null>(null);

  const partnerTeam = partners.find((t) => t.rosterId === partnerRosterId) ?? null;
  const catalog = bootstrap?.players ?? {};
  const nameOf = (id: string) => catalog[id]?.name ?? id;
  const posOf = (id: string) => catalog[id]?.position ?? '';
  const sortRoster = (ids: string[]) =>
    [...ids].sort(
      (a, b) => (POS_ORDER[posOf(a)] ?? 9) - (POS_ORDER[posOf(b)] ?? 9) || nameOf(a).localeCompare(nameOf(b)),
    );

  if (!bootstrap || !userTeam || !stored) {
    return <div style={{ padding: 24 }}>Connect a league to analyze trades.</div>;
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
    setResult(null);
  };

  async function analyze(userDrops: string[] | null = null) {
    if (!stored || !partnerRosterId || (give.size === 0 && getP.size === 0)) return;
    setLoading(true);
    setError(null);
    try {
      const r = await analyzeTradeApi(stored.leagueId, {
        userId: stored.userId,
        partnerRosterId,
        give: [...give],
        get: [...getP],
        userDrops,
      });
      setResult(r);
      setDrops(userDrops);
      if (!r.available) setError(r.reason ?? 'Could not analyze this trade.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyze failed.');
    } finally {
      setLoading(false);
    }
  }

  const rosterList = (
    ids: string[],
    selected: Set<string>,
    onToggle: (id: string) => void,
    accent: string,
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {sortRoster(ids).map((id) => (
        <label
          key={id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 6px',
            borderRadius: 6,
            cursor: 'pointer',
            background: selected.has(id) ? `${accent}22` : 'transparent',
            fontSize: 13,
          }}
        >
          <input type="checkbox" checked={selected.has(id)} onChange={() => onToggle(id)} />
          <span style={{ minWidth: 34, color: accent, fontWeight: 600 }}>{posOf(id)}</span>
          <span>{nameOf(id)}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div style={{ padding: '16px 20px', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Trade Analyzer</h1>
      <p style={{ opacity: 0.7, marginTop: 0, fontSize: 14 }}>
        Swap players, re-simulate the rest of the season (10,000×), and see the change in your
        championship odds, playoff odds, seed, and wins.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '12px 0' }}>
        <label style={{ fontSize: 14 }}>Trade with:</label>
        <select
          value={partnerRosterId ?? ''}
          onChange={(e) => {
            setPartnerRosterId(Number(e.target.value) || null);
            setGetP(new Set());
            setResult(null);
          }}
          style={{ padding: 6, fontSize: 14 }}
        >
          <option value="">Select a team…</option>
          {partners.map((t) => (
            <option key={t.rosterId} value={t.rosterId}>
              {t.teamName}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h3 style={{ marginBottom: 6 }}>You give ({userTeam.teamName})</h3>
          {rosterList(userTeam.players, give, (id) => toggle(give, setGive, id), '#f59e0b')}
        </div>
        <div>
          <h3 style={{ marginBottom: 6 }}>You get {partnerTeam ? `(${partnerTeam.teamName})` : ''}</h3>
          {partnerTeam ? (
            rosterList(partnerTeam.players, getP, (id) => toggle(getP, setGetP, id), '#38bdf8')
          ) : (
            <p style={{ opacity: 0.6, fontSize: 13 }}>Pick a team above.</p>
          )}
        </div>
      </div>

      <button
        onClick={() => analyze(null)}
        disabled={loading || !partnerRosterId || (give.size === 0 && getP.size === 0)}
        style={{
          marginTop: 16,
          padding: '10px 20px',
          fontSize: 15,
          fontWeight: 700,
          borderRadius: 8,
          border: 'none',
          background: '#f59e0b',
          color: '#1a1204',
          cursor: 'pointer',
          opacity: loading || !partnerRosterId || (give.size === 0 && getP.size === 0) ? 0.5 : 1,
        }}
      >
        {loading ? 'Simulating…' : 'Analyze trade'}
      </button>

      {error ? <p style={{ color: '#ff6b6b', marginTop: 12 }}>{error}</p> : null}

      {result?.available && result.you && result.partner ? (
        <Results
          result={result}
          userTeam={userTeam}
          drops={drops}
          onOverrideDrops={(d) => analyze(d)}
          nameOf={nameOf}
          posOf={posOf}
        />
      ) : null}
    </div>
  );
}

function Delta({ v, goodUp = true, pct = false }: { v: number; goodUp?: boolean; pct?: boolean }) {
  const good = goodUp ? v > 0 : v < 0;
  const color = v === 0 ? '#8a8f98' : good ? '#22c55e' : '#ff6b6b';
  const sign = v > 0 ? '+' : '';
  return (
    <span style={{ color, fontWeight: 700 }}>
      {sign}
      {v.toFixed(1)}
      {pct ? '%' : ''}
    </span>
  );
}

function SideCard({ side }: { side: TradeSideDelta }) {
  const rows: { label: string; b: number; a: number; d: number; goodUp: boolean; pct: boolean }[] = [
    { label: 'Championship', b: side.before.titleProb, a: side.after.titleProb, d: side.delta.titleProb, goodUp: true, pct: true },
    { label: 'Make playoffs', b: side.before.playoffProb, a: side.after.playoffProb, d: side.delta.playoffProb, goodUp: true, pct: true },
    { label: 'Expected wins', b: side.before.expWins, a: side.after.expWins, d: side.delta.expWins, goodUp: true, pct: false },
    { label: 'Avg seed', b: side.before.avgSeed, a: side.after.avgSeed, d: side.delta.avgSeed, goodUp: false, pct: false },
  ];
  return (
    <div style={{ border: '1px solid #ffffff22', borderRadius: 10, padding: 14 }}>
      <p style={{ fontWeight: 700, marginTop: 0, marginBottom: 8 }}>
        {side.teamName} {side.isUser ? '(you)' : ''}
      </p>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 14 }}>
          <span style={{ opacity: 0.75 }}>{r.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {r.b.toFixed(1)}{r.pct ? '%' : ''} → {r.a.toFixed(1)}{r.pct ? '%' : ''} &nbsp;
            <Delta v={r.d} goodUp={r.goodUp} pct={r.pct} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Results({
  result,
  userTeam,
  drops,
  onOverrideDrops,
  nameOf,
  posOf,
}: {
  result: TradeAnalysis;
  userTeam: { players: string[] };
  drops: string[] | null;
  onOverrideDrops: (d: string[]) => void;
  nameOf: (id: string) => string;
  posOf: (id: string) => string;
}) {
  const you = result.you!;
  const verdict = you.delta.titleProb > 0.1 ? 'Make this trade' : you.delta.titleProb < -0.1 ? 'Pass' : 'Roughly even';
  const vColor = you.delta.titleProb > 0.1 ? '#22c55e' : you.delta.titleProb < -0.1 ? '#ff6b6b' : '#8a8f98';
  const needYou = result.dropsNeeded?.you ?? 0;
  const suggested = (drops ?? result.drops?.you.map((d) => d.playerId)) ?? [];

  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontSize: 20, fontWeight: 800, color: vColor, margin: '0 0 12px' }}>
        {verdict} — championship <Delta v={you.delta.titleProb} pct />
      </p>

      {result.warnings?.you ? (
        <div style={{ border: '1px solid #ff6b6b', background: '#ff6b6b1a', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 14 }}>
          ⚠ {result.warnings.you}
        </div>
      ) : null}

      {needYou > 0 ? (
        <div style={{ border: '1px solid #f59e0b55', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}>
            This trade puts you {needYou} over your roster limit — you'd drop {needYou}{' '}
            {needYou === 1 ? 'player' : 'players'}. Suggested (least valuable): the analysis reflects this drop.
            Override:
          </p>
          {Array.from({ length: needYou }).map((_, i) => (
            <select
              key={i}
              value={suggested[i] ?? ''}
              onChange={(e) => {
                const next = [...suggested];
                next[i] = e.target.value;
                onOverrideDrops(next.filter(Boolean));
              }}
              style={{ padding: 5, marginRight: 8, fontSize: 13 }}
            >
              {userTeam.players.map((id) => (
                <option key={id} value={id}>
                  {posOf(id)} {nameOf(id)}
                </option>
              ))}
            </select>
          ))}
        </div>
      ) : null}

      {result.drops && result.drops.partner.length > 0 ? (
        <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
          {result.partner!.teamName} would drop: {result.drops.partner.map((d) => d.name).join(', ')} (auto).
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        <SideCard side={you} />
        <SideCard side={result.partner!} />
      </div>
    </div>
  );
}
