import { IconGlyph } from "../ui/IconGlyph";

const FIT_COLORS = { response: "#0064ff", voice: "#2f7cff", eye: "#0ea5e9", posture: "#ff8a00" };

// 4-Fit 종합 점수를 보여주는 레이더(다이아몬드) 차트. 응답(위)·목소리(오른쪽)·시선(아래)·자세(왼쪽).
export function RadarChart({ fits, average = [72, 70, 74, 72], showLegend = true }) {
  const axes = [[100, 20], [180, 100], [100, 180], [20, 100]];
  const labels = [[100, 10, "응답", "middle"], [192, 104, "목소리", "start"], [100, 197, "시선", "middle"], [8, 104, "자세", "end"]];
  const pointAt = (index, score) => {
    const [x, y] = axes[index];
    const scale = Math.max(0, Math.min(100, score)) / 100;
    return `${100 + (x - 100) * scale},${100 + (y - 100) * scale}`;
  };
  const scores = fits.map((fit) => (fit.measured === false ? 0 : fit.score));
  const scorePoints = scores.map((score, index) => pointAt(index, score)).join(" ");
  const averagePoints = average.map((score, index) => pointAt(index, score)).join(" ");

  return (
    <div className="radar-wrap">
      <svg className="radar-chart" viewBox="0 0 200 210" role="img" aria-label={`응답 ${scores[0]}점, 목소리 ${scores[1]}점, 시선 ${scores[2]}점, 자세 ${scores[3]}점`}>
        {[100, 75, 50, 25].map((scale) => (
          <polygon key={scale} className="radar-grid" points={axes.map(([x, y]) => `${100 + (x - 100) * scale / 100},${100 + (y - 100) * scale / 100}`).join(" ")} />
        ))}
        {axes.map(([x, y], index) => <line key={index} className="radar-axis" x1="100" y1="100" x2={x} y2={y} />)}
        <polygon className="radar-average" points={averagePoints} />
        <polygon className="radar-score" points={scorePoints} />
        {scores.map((score, index) => { const [x, y] = pointAt(index, score).split(","); return <circle key={index} className="radar-point" cx={x} cy={y} r="3.4" />; })}
        {labels.map(([x, y, label, anchor]) => <text key={label} className="radar-label" x={x} y={y} textAnchor={anchor}>{label}</text>)}
      </svg>
      {showLegend && <p className="radar-legend"><i className="dot-score" /> 내 점수&nbsp;&nbsp;<i className="dot-average" /> 평균</p>}
    </div>
  );
}

// 점수 추이(Trend Chart). series: [{ name, color, values:[] }], xLabels: []
export function TrendChart({ series, xLabels, height = 210, min = 40, max = 100 }) {
  const width = 640;
  const padX = 34;
  const padTop = 18;
  const padBottom = 34;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const count = xLabels.length;
  const stepX = count > 1 ? innerW / (count - 1) : innerW;
  const xAt = (index) => padX + stepX * index;
  const yAt = (value) => padTop + innerH * (1 - (Math.max(min, Math.min(max, value)) - min) / (max - min));
  const yTicks = [max, Math.round((max + min) / 2), min];

  return (
    <div className="trend-wrap">
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="점수 추이 그래프">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="trend-grid" x1={padX} x2={width - padX} y1={yAt(tick)} y2={yAt(tick)} />
            <text className="trend-tick" x={padX - 8} y={yAt(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        {series.map((line) => {
          const path = line.values.map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(value)}`).join(" ");
          const area = `${path} L ${xAt(line.values.length - 1)} ${padTop + innerH} L ${xAt(0)} ${padTop + innerH} Z`;
          return (
            <g key={line.name}>
              {line.fill !== false && <path className="trend-area" d={area} fill={line.color} opacity="0.08" />}
              <path className="trend-line" d={path} stroke={line.color} />
              {line.values.map((value, index) => <circle key={index} className="trend-point" cx={xAt(index)} cy={yAt(value)} r="3.6" fill={line.color} />)}
            </g>
          );
        })}
        {xLabels.map((label, index) => <text key={label + index} className="trend-xlabel" x={xAt(index)} y={height - 12} textAnchor="middle">{label}</text>)}
      </svg>
      <div className="trend-legend">{series.map((line) => <span key={line.name}><i style={{ background: line.color }} /> {line.name}</span>)}</div>
    </div>
  );
}

// 연습 화면 우측의 실시간 4-Fit 게이지. percent가 있으면 원형 게이지, 아니면 파형/상태 표시.
export function LiveFitMeter({ icon, label, english, tone, percent, caption, kind = "ring" }) {
  const color = FIT_COLORS[tone] || "#0064ff";
  return (
    <div className={`live-fit-meter ${tone}`}>
      <div className="live-fit-visual">
        {kind === "ring" && typeof percent === "number" ? (
          <RingGauge value={percent} color={color} />
        ) : kind === "wave" ? (
          <span className="live-wave" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ background: color }} />)}</span>
        ) : (
          <span className="live-fit-icon" style={{ color }}><IconGlyph icon={icon} size={26} /></span>
        )}
      </div>
      <div className="live-fit-copy">
        <span className="live-fit-label"><IconGlyph icon={icon} size={16} /> {label}<em>{english}</em></span>
        <strong>{caption}</strong>
      </div>
    </div>
  );
}

function RingGauge({ value, color, size = 48 }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <span className="ring-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 58 58" aria-hidden="true">
        <circle className="ring-track" cx="29" cy="29" r={r} />
        <circle className="ring-fill" cx="29" cy="29" r={r} stroke={color} strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <b>{value}<small>%</small></b>
    </span>
  );
}

// 비교 화면의 시도 카드 안에서 쓰는 4-Fit 미니 막대 (응답 ▓▓▓ 72).
export function FitBarRow({ icon, label, value, tone }) {
  const color = FIT_COLORS[tone] || "#0064ff";
  return (
    <div className={`fit-bar-row ${tone}`}>
      <span className="fit-bar-label"><IconGlyph icon={icon} size={16} /> {label}</span>
      <i className="fit-bar-track"><span style={{ width: `${value}%`, background: color }} /></i>
      <b>{value}</b>
    </div>
  );
}
