import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({ open, onClose, title, wide, className = "", children, footer }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Enter" || e.repeat) return;
      const target = e.target;
      if (!dialogRef.current?.contains(target)) return;
      if (target?.tagName === "TEXTAREA") return;
      if (target?.isContentEditable) return;
      if (target?.closest?.("[data-modal-enter-ignore]")) return;
      const primary = dialogRef.current.querySelector("[data-modal-primary]:not(:disabled)");
      if (!primary) return;
      if (target === primary || primary.contains(target)) return;
      e.preventDefault();
      primary.click();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="wh-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`wh-modal${wide ? " wh-modal--wide" : ""}${className ? ` ${className}` : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wh-modal-title"
      >
        <header className="wh-modal__header">
          <h3 className="wh-modal__title" id="wh-modal-title">
            {title}
          </h3>
          <button type="button" className="wh-modal__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="wh-modal__body">{children}</div>
        {footer != null && <footer className="wh-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
