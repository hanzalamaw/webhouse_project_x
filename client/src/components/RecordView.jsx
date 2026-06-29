import { StatusBadge } from "./Badge";

export function RecordViewSummary({ title, subtitle, status, chips = [] }) {
  return (
    <div className="wh-record-summary">
      <div className="wh-record-summary__accent" aria-hidden />
      <div className="wh-record-summary__inner">
        <div className="wh-record-summary__main">
          <h2 className="wh-record-summary__title">{title}</h2>
          {subtitle && <p className="wh-record-summary__subtitle">{subtitle}</p>}
        </div>
        <div className="wh-record-summary__aside">
          {status && <StatusBadge status={status} />}
          {chips.map((chip) => (
            <span key={chip.label} className="wh-record-summary__chip">
              <span className="wh-record-summary__chip-label">{chip.label}</span>
              <span className="wh-record-summary__chip-value">{chip.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailGrid({ children, columns = 2 }) {
  return (
    <div className={`wh-detail-grid wh-detail-grid--cols-${columns}`}>
      {children}
    </div>
  );
}

export function DetailValue({ label, children, fullWidth, multiline, highlight }) {
  return (
    <div
      className={[
        "wh-detail-cell",
        fullWidth ? "wh-detail-cell--full" : "",
        multiline ? "wh-detail-cell--multiline" : "",
        highlight ? "wh-detail-cell--highlight" : "",
      ].filter(Boolean).join(" ")}
    >
      {label && <span className="wh-detail-cell__label">{label}</span>}
      <div className="wh-detail-cell__value">{children ?? "—"}</div>
    </div>
  );
}
