import { Button } from "./Button";
import { Modal } from "./Modal";

export function ConfirmActionModal({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  error = "",
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? "Please wait…" : confirmLabel}
          </Button>
        </>
      }
    >
      {message ? <p className="wh-modal__text">{message}</p> : null}
      {error ? <p className="wh-field__error">{error}</p> : null}
    </Modal>
  );
}
