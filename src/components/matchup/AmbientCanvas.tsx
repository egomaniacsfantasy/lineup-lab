import './AmbientCanvas.css';

const MONEYLINE_MARKS = [
  { value: '-220', x: 80, y: 190, rotate: -8, size: 118 },
  { value: '+180', x: 460, y: 110, rotate: 5, size: 92 },
  { value: '-145', x: 880, y: 260, rotate: -4, size: 104 },
  { value: '+450', x: 1320, y: 140, rotate: 7, size: 116 },
  { value: '-330', x: 1680, y: 340, rotate: -10, size: 88 },
  { value: '-115', x: 260, y: 520, rotate: 9, size: 84 },
  { value: '+275', x: 700, y: 650, rotate: -6, size: 112 },
  { value: '+900', x: 1160, y: 570, rotate: 4, size: 94 },
  { value: '-105', x: 1540, y: 760, rotate: 8, size: 104 },
  { value: '+150', x: 120, y: 930, rotate: -5, size: 96 },
  { value: '-260', x: 560, y: 1040, rotate: 6, size: 120 },
  { value: '+325', x: 1010, y: 930, rotate: -9, size: 86 },
];

export function AmbientCanvas() {
  return (
    <div className="ambient-canvas" aria-hidden="true">
      <svg
        className="ambient-canvas__moneylines"
        viewBox="0 0 1920 1200"
        preserveAspectRatio="xMidYMid slice"
      >
        {MONEYLINE_MARKS.map((mark) => (
          <text
            className="ambient-canvas__moneyline"
            dominantBaseline="middle"
            fontSize={mark.size}
            key={mark.value}
            textAnchor="middle"
            transform={`rotate(${mark.rotate} ${mark.x} ${mark.y})`}
            x={mark.x}
            y={mark.y}
          >
            {mark.value}
          </text>
        ))}
      </svg>
      <div className="ambient-canvas__glow" />
      <div className="ambient-canvas__grain" />
      <div className="ambient-canvas__watermark">
        <span>ODDS GODS</span>
        <span>LINEUP LAB</span>
      </div>
    </div>
  );
}
