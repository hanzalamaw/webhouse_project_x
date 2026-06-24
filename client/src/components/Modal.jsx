import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Modal({ open, onClose, title, wide, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="wh-modal-overlay" onClick={onClose}>
      <div
        className={`wh-modal${wide ? " wh-modal--wide" : ""}`}
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
