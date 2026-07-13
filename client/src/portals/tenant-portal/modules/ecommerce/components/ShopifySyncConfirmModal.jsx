import { Modal } from "../../../../../components/Modal";
import { Button } from "../../../../../components/Button";

export function ShopifySyncConfirmModal({
  open,
  onDismiss,
  onSaveLocal,
  onConfirm,
  storeName,
  entityLabel = "record",
  loading = false,
  mode = "update",
  requireSync = false,
}) {
  const isCreate = mode === "create";
  const linkedUpdate = !isCreate && requireSync;
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onDismiss}
      title={isCreate ? "Create in Shopify too?" : linkedUpdate ? "Sync to Shopify required" : "Sync to Shopify?"}
      footer={
        <>
          <Button variant="secondary" onClick={onDismiss} disabled={loading}>
            Keep editing
          </Button>
          {!requireSync && (
            <Button variant="secondary" onClick={onSaveLocal} disabled={loading}>
              {isCreate ? "Save in ERP only" : "Save locally only"}
            </Button>
          )}
          <Button modalPrimary onClick={onConfirm} disabled={loading}>
            {loading ? "Saving…" : isCreate ? "Save & create in Shopify" : "Save & sync to Shopify"}
          </Button>
        </>
      }
    >
      <p className="wh-modal__text">
        {isCreate ? (
          <>
            Your Shopify store{storeName ? ` (${storeName})` : ""} is connected. Do you also want to create this{" "}
            {entityLabel} in Shopify?
          </>
        ) : linkedUpdate ? (
          <>
            This {entityLabel} is linked to your Shopify store
            {storeName ? ` (${storeName})` : ""}. Changes must be synced to Shopify — local-only save is not allowed.
          </>
        ) : (
          <>
            This {entityLabel} is linked to your Shopify store
            {storeName ? ` (${storeName})` : ""}. Saving will also update it in Shopify.
          </>
        )}
      </p>
      {!requireSync && (
        <p className="wh-muted" style={{ marginTop: "0.75rem" }}>
          {isCreate
            ? "Choose \"Keep editing\" to go back without saving, or \"Save in ERP only\" to create the record in your ERP without Shopify."
            : "Choose \"Keep editing\" to go back without saving, or \"Save locally only\" to update your ERP without pushing to Shopify."}
        </p>
      )}
    </Modal>
  );
}
