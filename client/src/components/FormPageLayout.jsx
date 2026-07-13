import { forwardRef } from "react";

export function FormPageLayout({ children }) {
  return <div className="wh-form-page">{children}</div>;
}

export function FormPageAlerts({ error, message }) {
  return (
    <>
      {error ? <div className="wh-alert wh-alert--error">{error}</div> : null}
      {message ? <div className="wh-alert wh-alert--success">{message}</div> : null}
    </>
  );
}

export const FormActions = forwardRef(function FormActions({ children, error, message }, ref) {
  return (
    <div ref={ref} className="wh-form-actions-wrap">
      {error ? <div className="wh-alert wh-alert--error wh-form-actions__alert">{error}</div> : null}
      {message ? <div className="wh-alert wh-alert--success wh-form-actions__alert">{message}</div> : null}
      <div className="wh-form-actions">{children}</div>
    </div>
  );
});
