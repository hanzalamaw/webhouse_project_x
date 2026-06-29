import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
function GhostIcon() {
  return (
    <svg
      className="wh-impersonation-ghost__svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C7.58 2 4 5.58 4 10c0 2.55 1.24 4.81 3.15 6.22L7 22l3-1.5L12 22l2-1.5L17 22l-.15-5.78C18.76 14.81 20 12.55 20 10c0-4.42-3.58-8-8-8zm-2.25 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm4.5 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

export function ImpersonationGhostIndicator({ tenantName, onEnd }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return createPortal(
    <div className="wh-impersonation-ghost" ref={rootRef}>
      <button
        type="button"
        className="wh-impersonation-ghost__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Impersonating ${tenantName || "tenant"}`}
        aria-expanded={open}
        title={`Impersonating ${tenantName || "tenant"}`}
      >
        <GhostIcon />
      </button>
      {open && (
        <div className="wh-impersonation-ghost__popover" role="dialog" aria-label="Impersonation session">
          <p className="wh-impersonation-ghost__text">
            Impersonating <strong>{tenantName}</strong>
          </p>
          <Button type="button" variant="secondary" className="wh-btn--sm" onClick={onEnd}>
            End session
          </Button>
        </div>
      )}
    </div>,
    document.body
  );
}