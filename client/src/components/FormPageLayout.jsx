export function FormPageLayout({ children, wide = false }) {
  return <div className={`wh-form-page${wide ? " wh-form-page--wide" : ""}`}>{children}</div>;
}

export function FormPageAlerts({ error, message }) {
  return (
    <>
      {error ? <div className="wh-alert wh-alert--error">{error}</div> : null}
      {message ? <div className="wh-alert wh-alert--success">{message}</div> : null}
    </>
  );
}

export function FormActions({ children }) {
  return <div className="wh-form-actions">{children}</div>;
}
