import { Modal } from "./Modal";
import { Button } from "./Button";

export function UnsavedChangesDialog({ open, onStay, onDiscard, reloadPending = false }) {
  return (
    <Modal
      open={open}
      onClose={onStay}
      title="Unsaved changes"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onStay}>
            Stay on page
          </Button>
          <Button type="button" variant="danger" onClick={onDiscard}>
            {reloadPending ? "Reload without saving" : "Discard changes"}
          </Button>
        </>
      }
    >
      <p>
        {reloadPending
          ? "You have unsaved changes. Reloading will discard them."
          : "You have unsaved changes. Save your work or discard changes before leaving this page."}
      </p>
    </Modal>
  );
}
