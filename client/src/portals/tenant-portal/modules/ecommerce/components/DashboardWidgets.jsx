export function Kpi({ label, value, hint, tone = "default", icon }) {
  return (
    <div className={`wh-kpi wh-kpi--${tone}`}>
      <div className="wh-kpi__top">
        <span className="wh-kpi__label">{label}</span>
        {icon && <span className="wh-kpi__icon">{icon}</span>}
      </div>
      <span className="wh-kpi__value">{value}</span>
      {hint && <span className="wh-kpi__hint">{hint}</span>}
    </div>
  );
}

export function Panel({ title, subtitle, children, flush, action }) {
  return (
    <div className="wh-panel">
      <div className="wh-panel__head">
        <div>
          <h3 className="wh-panel__title">{title}</h3>
          {subtitle && <p className="wh-panel__subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={`wh-panel__body${flush ? " wh-panel__body--flush" : ""}`}>{children}</div>
    </div>
  );
}

export function ConnectionBadge({ status }) {
  const map = {
    connected: "success",
    completed: "success",
    running: "warning",
    pending: "warning",
    failed: "danger",
    idle: "neutral",
    disconnected: "neutral",
  };
  const tone = map[status] || "neutral";
  const label = status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : "Idle";
  return <span className={`wh-badge wh-badge--${tone}`}>{label}</span>;
}
