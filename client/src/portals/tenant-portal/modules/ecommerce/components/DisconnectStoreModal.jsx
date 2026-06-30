import { useEffect, useState } from "react";
import { Modal } from "../../../../../components/Modal";
import { Button } from "../../../../../components/Button";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";

const POLICY_OPTIONS = [
  {
    id: "keep",
    title: "Keep synced data",
    description:
      "Disconnect the store but keep staged records and any data already imported into your ERP. You can reconnect later.",
  },
  {
    id: "delete_staged",
    title: "Delete staged data only",
    description:
      "Remove marketplace staging records, sync logs, and links. Imported products, customers, and orders in your ERP stay untouched.",
  },
  {
    id: "delete_all",
    title: "Delete staged + imported ERP data",
    description:
      "Remove staging data and soft-delete products, customers, and orders that were imported from this integration. Manual records are never deleted.",
  },
];

export default function DisconnectStoreModal({
  open,
  onClose,
  platform,
  storeName,
  authFetch,
  onDisconnected,
}) {
  const [policy, setPolicy] = useState("keep");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPolicy("keep");
    setError("");
    ecomApiGet(platform, "oauth/disconnect-preview", authFetch)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [open, platform, authFetch]);

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      await ecomApiPost(platform, "oauth/disconnect", authFetch, { dataPolicy: policy });
      onDisconnected?.();
      onClose();
    } catch (err) {
      setError(err.message || "Could not disconnect store");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Disconnect ${storeName || "store"}?`}
      wide
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleConfirm} disabled={loading}>
            {loading ? "Disconnecting…" : "Disconnect"}
          </Button>
        </>
      }
    >
      <p className="wh-modal__text">
        Choose what happens to data synced from this store. This cannot be undone for deleted data.
      </p>

      {preview && (
        <div className="wh-muted" style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
          Staged: {(preview.stagedRecords?.order || 0)} orders,{" "}
          {(preview.stagedRecords?.product || 0)} products,{" "}
          {(preview.stagedRecords?.customer || 0)} customers · Imported to ERP:{" "}
          {(preview.importedToErp?.product || 0)} products,{" "}
          {(preview.importedToErp?.customer || 0)} customers,{" "}
          {(preview.importedToErp?.order || 0)} orders
        </div>
      )}

      <div className="wh-form" style={{ gap: "0.75rem" }}>
        {POLICY_OPTIONS.map((opt) => (
          <label
            key={opt.id}
            className="wh-card"
            style={{
              display: "block",
              padding: "0.85rem 1rem",
              cursor: "pointer",
              border: policy === opt.id ? "2px solid var(--wh-accent)" : "1px solid var(--wh-border)",
            }}
          >
            <div style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start" }}>
              <input
                type="radio"
                name="disconnect_policy"
                value={opt.id}
                checked={policy === opt.id}
                onChange={() => setPolicy(opt.id)}
              />
              <div>
                <strong>{opt.title}</strong>
                <p className="wh-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
                  {opt.description}
                </p>
              </div>
            </div>
          </label>
        ))}
      </div>

      {error && <p className="wh-field__error" style={{ marginTop: "0.75rem" }}>{error}</p>}
    </Modal>
  );
}
