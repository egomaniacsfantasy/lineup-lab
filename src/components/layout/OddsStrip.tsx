import './OddsStrip.css';

const ODDS_DATA = [
  'KC -3 · 47.5',
  'PHI -7.5 · 44.5',
  'SF -1.5 · 51.5',
  'BUF -4 · 49.0',
  'DAL +2.5 · 43.5',
  'MIA -3 · 48.5',
  'DET -6 · 52.0',
  'CIN +1 · 46.5',
  'BAL -3.5 · 47.0',
  'MIN -2.5 · 44.0',
  'HOU -5 · 43.0',
  'NYJ +7 · 38.5',
];

function OddsSegment({ duplicateKey }: { duplicateKey: string }) {
  return (
    <div className="odds-strip__segment" aria-hidden="true">
      {ODDS_DATA.map((item, index) => (
        <span className="odds-strip__item-group" key={`${duplicateKey}-${item}`}>
          <span className="odds-strip__item">{item}</span>
          {index < ODDS_DATA.length - 1 ? (
            <span className="odds-strip__separator">|</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function OddsStrip() {
  return (
    <div className="odds-strip" aria-hidden="true">
      <div className="odds-strip__track">
        <OddsSegment duplicateKey="a" />
        <OddsSegment duplicateKey="b" />
      </div>
    </div>
  );
}
