import { buildAuditChanges } from "../utils/humanizeAudit";

function isEmptyAuditValue(value) {
  if (value == null) return true;
  if (typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).filter(
      (k) => !["summary", "entity_type", "entity_id", "tenant_id", "user_id", "table", "record_id", "action"].includes(k)
    );
    return keys.length === 0;
  }
  return false;
}

export function DiffViewer({ oldValue, newValue }) {
  const isInsert = isEmptyAuditValue(oldValue) && !isEmptyAuditValue(newValue);
  const isDelete = !isEmptyAuditValue(oldValue) && isEmptyAuditValue(newValue);
  const rows = buildAuditChanges(oldValue, newValue);

  if (!rows.length) {
    return <p className="wh-muted">No details were recorded for this action.</p>;
  }

  if (isInsert) {
    return (
      <div className="wh-changelist">
        <p className="wh-muted wh-changelist__mode">Values inserted</p>
        {rows.map(({ key, label, toText }) => (
          <div key={key} className="wh-changelist__item">
            <span className="wh-changelist__field">{label}</span>
            <div className="wh-changelist__change">
              <span className="wh-changelist__to"><strong>{toText}</strong></span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isDelete) {
    return (
      <div className="wh-changelist">
        <p className="wh-muted wh-changelist__mode">Values deleted</p>
        {rows.map(({ key, label, fromText }) => (
          <div key={key} className="wh-changelist__item">
            <span className="wh-changelist__field">{label}</span>
            <div className="wh-changelist__change">
              <span className="wh-changelist__from"><strong>{fromText}</strong></span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="wh-changelist wh-changelist--table">
      <p className="wh-muted wh-changelist__mode">Changes</p>
      <div className="wh-changelist__table-head">
        <span>Field</span>
        <span>Previous</span>
        <span>Updated</span>
      </div>
      {rows.map(({ key, label, fromText, toText }) => (
        <div key={key} className="wh-changelist__table-row">
          <span className="wh-changelist__field">{label}</span>
          <span className="wh-changelist__from">{fromText}</span>
          <span className="wh-changelist__to"><strong>{toText}</strong></span>
        </div>
      ))}
    </div>
  );
}
