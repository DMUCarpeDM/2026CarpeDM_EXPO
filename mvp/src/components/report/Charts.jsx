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
