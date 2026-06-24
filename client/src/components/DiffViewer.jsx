function flattenObject(obj, prefix = "") {
  const out = {};
  if (obj == null || typeof obj !== "object") return out;
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val != null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flattenObject(val, path));
    } else {
      out[path] = val;
    }
  }
  return out;
}

export function DiffViewer({ oldValue, newValue, onlyChanged = true }) {
  const oldFlat = flattenObject(oldValue);
  const newFlat = flattenObject(newValue);
  const keys = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort();

  const rows = keys
    .map((key) => {
      const oldV = oldFlat[key];
      const newV = newFlat[key];
      const changed = JSON.stringify(oldV) !== JSON.stringify(newV);
      return { key, oldV, newV, changed };
    })
    .filter((row) => !onlyChanged || row.changed);

  if (!rows.length) {
    return <p className="wh-muted">No changes recorded.</p>;
  }

  return (
    <div className="wh-diff">
      <div className="wh-diff__header">
        <span>Field</span>
        <span className="wh-diff__col--old">Previous</span>
        <span className="wh-diff__col--new">Updated</span>
      </div>
      {rows.map(({ key, oldV, newV, changed }) => (
        <div key={key} className={`wh-diff__row${changed ? " wh-diff__row--changed" : ""}`}>
          <span className="wh-diff__key">{key}</span>
          <span className="wh-diff__val wh-diff__val--old">{formatVal(oldV)}</span>
          <span className="wh-diff__val wh-diff__val--new">{formatVal(newV)}</span>
        </div>
      ))}
    </div>
  );
}

function formatVal(v) {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
