/** 4-Fit 레이더 차트 — 직전 세션(점선)과 겹쳐 개선을 한눈에 보여준다. */

const AXES = [
  { key: 'response', label: '응답' },
  { key: 'voice', label: '발화' },
  { key: 'expression', label: '표정' },
  { key: 'posture', label: '자세' },
] as const;

const CX = 110;
const CY = 105;
const R = 72;

function point(axisIndex: number, value: number): [number, number] {
  const angle = (Math.PI / 2) * axisIndex - Math.PI / 2; // 12시부터 시계방향
  const r = (Math.max(0, Math.min(100, value)) / 100) * R;
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}

function polygon(values: Record<string, number | null | undefined>): string {
  return AXES.map((a, i) => point(i, values[a.key] ?? 0).join(',')).join(' ');
}

export default function RadarChart({
  current,
  previous,
}: {
  current: Record<string, number | null | undefined>;
  previous?: Record<string, number | null | undefined> | null;
}) {
  return (
    <svg viewBox="0 0 220 210" className="radar-chart" role="img" aria-label="4-Fit 레이더 차트">
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          points={AXES.map((_, i) => point(i, level).join(',')).join(' ')}
          className="radar-grid"
        />
      ))}
      {AXES.map((a, i) => {
        const [x, y] = point(i, 100);
        return <line key={a.key} x1={CX} y1={CY} x2={x} y2={y} className="radar-grid" />;
      })}
      {previous && <polygon points={polygon(previous)} className="radar-previous" />}
      <polygon points={polygon(current)} className="radar-current" />
      {AXES.map((a, i) => {
        const [x, y] = point(i, 128);
        const value = current[a.key];
        return (
          <text key={a.key} x={x} y={y} className="radar-label" textAnchor="middle">
            {a.label} {value == null ? '—' : Math.round(value)}
          </text>
        );
      })}
    </svg>
  );
}
