import { useState, useEffect } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm delete",
  recordName = "this record",
  categoryLabel = "record",
  cascadeItems = [],
  confirmPhrase = "DELETE",
  loading = false,
  error = "",
}) {
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!open) setInput("");
  }, [open]);

  const handleClose = () => {
    setInput("");
    onClose();
  };

  const canDelete = input === confirmPhrase;

  const handleConfirm = async () => {
    if (!canDelete || loading) return;
    await onConfirm();
  };

  const items = Array.isArray(cascadeItems) ? cascadeItems.filter(Boolean) : [];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" modalPrimary disabled={!canDelete || loading} onClick={handleConfirm}>
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </>
      }
    >
      <p className="wh-modal__text">
        Deleting <strong>{recordName}</strong> will also delete everything related to this{" "}
        <strong>{categoryLabel}</strong> (soft delete). Related ERP records are permanently removed after 7 days.
        {" "}Linked Shopify records are cancelled or drafted with a note first; if Shopify blocks the delete, nothing is removed in the ERP.
      </p>
      {items.length > 0 && (
        <ul className="wh-delete-cascade">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <p className="wh-modal__text">
        Type <strong>{confirmPhrase}</strong> to confirm:
      </p>
      <input
        className="wh-field__input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canDelete && !loading) {
            e.preventDefault();
            handleConfirm();
          }
        }}
        placeholder={confirmPhrase}
        autoFocus
      />
      {error && <p className="wh-field__error">{error}</p>}
    </Modal>
  );
}
