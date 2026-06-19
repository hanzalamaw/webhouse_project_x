export function Toggle({ checked, onChange, label }) {
  return (
    <label className="wh-toggle">
      <span className="wh-toggle__label">{label}</span>
      <span className="wh-toggle__track">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="wh-toggle__thumb" />
      </span>
    </label>
  );
}
