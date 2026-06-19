export function StatCard({ label, value, hint, tone = "default" }) {
  return (
    <div className={`wh-stat wh-stat--${tone}`}>
      <span className="wh-stat__label">{label}</span>
      <strong className="wh-stat__value">{value}</strong>
      {hint && <span className="wh-stat__hint">{hint}</span>}
    </div>
  );
}
