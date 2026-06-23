import { useState, useEffect } from "react";
import { Button } from "./Button";

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm delete",
  recordName = "this record",
  confirmPhrase = "DELETE",
  loading = false,
  error = "",
}) {
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!open) setInput("");
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setInput("");
    onClose();
  };

  const canDelete = input === confirmPhrase;

  const handleConfirm = async () => {
    if (!canDelete || loading) return;
    await onConfirm();
  };

  return (
    <div className="wh-modal-overlay" onClick={handleClose}>
      <div className="wh-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="wh-modal__title">{title}</h3>
        <p className="wh-modal__text">
          Deleting <strong>{recordName}</strong> will also mark all related records as deleted
          (soft delete). They are permanently removed after 7 days.
        </p>
        <p className="wh-modal__text">
          Type <strong>{confirmPhrase}</strong> to confirm:
        </p>
        <input
          className="wh-field__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={confirmPhrase}
          autoFocus
        />
        {error && <p className="wh-field__error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="wh-modal__actions">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" disabled={!canDelete || loading} onClick={handleConfirm}>
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
