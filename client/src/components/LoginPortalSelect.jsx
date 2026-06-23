import { loginPortalUrl } from "../api/client";

export function LoginPortalSelect({ value, onChange, showCopy = false }) {
  const options = [
    { value: "erp1", label: "ERP 1" },
    { value: "erp2", label: "ERP 2" },
    { value: "erp3", label: "ERP 3" },
  ];

  const copyLink = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(loginPortalUrl(value));
  };

  return (
    <div className="wh-portal-select">
      <select className="wh-field__input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select portal…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {showCopy && value && (
        <button type="button" className="wh-btn wh-btn--secondary wh-btn--sm" onClick={copyLink} title="Copy login link">
          Copy link
        </button>
      )}
    </div>
  );
}
