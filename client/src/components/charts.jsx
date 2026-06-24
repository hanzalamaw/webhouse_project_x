const CHART_COLORS = [
  "var(--color-accent)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-danger)",
  "var(--text-muted)",
];

function niceNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function BarChart({ data, formatValue = niceNumber, highlightLast = true }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="wh-bar-chart" role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const isLast = highlightLast && i === data.length - 1;
        const pct = (d.value / max) * 100;
        return (
          <div className="wh-bar-chart__col" key={d.label + i}>
            <span className="wh-bar-chart__val">{d.value ? formatValue(d.value) : ""}</span>
            <div className="wh-bar-chart__track">
              <div
                className={`wh-bar-chart__bar${isLast ? "" : " wh-bar-chart__bar--muted"}`}
                style={{ height: `${pct}%`, animationDelay: `${i * 45}ms` }}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
            </div>
            <span className="wh-bar-chart__label">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({ segments, size = 132, thickness = 16, centerLabel, centerValue }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="wh-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            className="wh-donut__ring"
            stroke="var(--hover-bg)"
            strokeWidth={thickness}
          />
          {total > 0 &&
            segments.map((s, i) => {
              const frac = s.value / total;
              const dash = frac * circumference;
              const seg = (
                <circle
                  key={s.label + i}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  className="wh-donut__ring"
                  stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return seg;
            })}
        </g>
        {centerValue != null && (
          <text
            x={cx}
            y={centerLabel ? cy - 4 : cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="22"
            fontWeight="600"
            fill="var(--text-primary)"
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="var(--text-muted)"
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="wh-donut__legend">
        {segments.map((s, i) => (
          <div className="wh-legend-item" key={s.label + i}>
            <span
              className="wh-legend-item__dot"
              style={{ background: s.color || CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="wh-legend-item__label">{s.label}</span>
            <span className="wh-legend-item__val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ data, formatValue = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="wh-hbars">
      {data.map((d, i) => (
        <div key={d.label + i}>
          <div className="wh-hbar__top">
            <span className="wh-hbar__label">{d.label}</span>
            <span className="wh-hbar__val">{formatValue(d.value)}</span>
          </div>
          <div className="wh-hbar__track">
            <div
              className="wh-hbar__fill"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color || "var(--color-accent)",
                animationDelay: `${i * 60}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export { CHART_COLORS };
