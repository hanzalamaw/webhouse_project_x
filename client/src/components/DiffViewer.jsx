import { buildAuditChanges } from "../utils/humanizeAudit";

export function DiffViewer({ oldValue, newValue }) {
  const rows = buildAuditChanges(oldValue, newValue);

  if (!rows.length) {
    return <p className="wh-muted">No details were changed in this action.</p>;
  }

  return (
    <div className="wh-changelist">
      {rows.map(({ key, label, fromText, toText, isNew }) => (
        <div key={key} className="wh-changelist__item">
          <span className="wh-changelist__field">{label}</span>
          <div className="wh-changelist__change">
            {isNew ? (
              <span className="wh-changelist__to">
                Set to <strong>{toText}</strong>
              </span>
            ) : (
              <>
                <span className="wh-changelist__from">{fromText}</span>
                <span className="wh-changelist__arrow" aria-hidden="true">→</span>
                <span className="wh-changelist__to"><strong>{toText}</strong></span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
