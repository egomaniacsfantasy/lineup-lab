import './AmbientCanvas.css';

export function AmbientCanvas() {
  return (
    <div className="ambient-canvas" aria-hidden="true">
      <div className="ambient-canvas__glow" />
      <div className="ambient-canvas__grain" />
      <div className="ambient-canvas__watermark">
        <span>ODDS GODS</span>
        <span>LINEUP LAB</span>
      </div>
    </div>
  );
}
