import { useEffect, useState } from "react";
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

// 연습 화면 우측의 실시간 4-Fit 게이지 (피그마: 라벨 → 링 → 상태 → 캡션 세로 구성).
// kind: percent(링 중앙에 %), wave(파형 아이콘), icon(글리프 아이콘). muted면 회색 처리.
const LIVE_FIT_COLORS = { response: "#0064ff", voice: "#2f7cff", eye: "#0ea5e9", posture: "#10b981" };

// 링 중앙 전용 커스텀 글리프 — 기성 아이콘이 링 안에서 투박해 보여 얇은 스트로크로 직접 그림.
function EyeGlyph({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.8 12C5.1 7.4 8.4 5.1 12 5.1s6.9 2.3 9.2 6.9c-2.3 4.6-5.6 6.9-9.2 6.9S5.1 16.6 2.8 12Z" />
      <circle cx="12" cy="12" r="2.9" />
      <circle cx="13" cy="11" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PostureGlyph({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12.6" cy="4.3" r="1.9" />
      <path d="M12.3 7.1 11.7 13" />
      <path d="M12.1 8.5 15.2 11.3" />
      <path d="M12.1 8.5 9 10.6" />
      <path d="M11.7 13 14.6 18.8" />
      <path d="M11.7 13 8.8 18.4" />
    </svg>
  );
}

const RING_GLYPHS = { eye: EyeGlyph, posture: PostureGlyph };

export function LiveFitMeter({ icon, label, english, tone, percent, status, caption, kind = "percent", muted = false, warn = false }) {
  const color = muted ? "#c3cad4" : warn ? "#f59e0b" : LIVE_FIT_COLORS[tone] || "#0064ff";
  const RingGlyph = RING_GLYPHS[icon];
  return (
    <div className={`live-fit-meter ${tone} ${muted ? "muted" : ""}`}>
      <span className="live-fit-label">{label}</span>
      <em className="live-fit-english">({english})</em>
      <RingGauge value={percent ?? 0} color={color}>
        {kind === "percent" ? (
          <b className="ring-value">{percent ?? "–"}<small>%</small></b>
        ) : kind === "wave" ? (
          <span className="ring-wave" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ background: color }} />)}</span>
        ) : (
          <span className="ring-icon" style={{ color }}>
            {RingGlyph ? <RingGlyph size={26} /> : <IconGlyph icon={icon} size={24} />}
          </span>
        )}
      </RingGauge>
      <b className="live-fit-status" style={{ color: muted ? "#8b95a1" : color }}>{status}</b>
      <small className="live-fit-caption">{caption}</small>
    </div>
  );
}

function RingGauge({ value, color, size = 78, children }) {
  // 마운트 직후 한 프레임 비운 뒤 목표값으로 채워 링이 차오르는 전환을 만들어요.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const r = 25;
  const c = 2 * Math.PI * r;
  const target = drawn ? Math.max(0, Math.min(100, value)) : 0;
  const offset = c - (target / 100) * c;
  return (
    <span className="ring-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 58 58" aria-hidden="true">
        <circle className="ring-track" cx="29" cy="29" r={r} />
        {value > 0 && <circle className="ring-fill" cx="29" cy="29" r={r} stroke={color} strokeDasharray={c} strokeDashoffset={offset} />}
      </svg>
      {children}
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
