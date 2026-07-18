import { useCallback, useEffect, useState } from "react";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { ecomApiGet } from "../api/ecommerceClient";
import StoreSyncPreviewModal from "./StoreSyncPreviewModal";

/**
 * Inline card that opens the shared sync review modal (Shopify + Daraz).
 * New/matching rows import automatically; conflicts ask Replace vs Keep.
 */
export default function ImportPreviewPanel({ platform, authFetch, connection, onImported }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const shopQuery = connection?.shop ? `?shop=${encodeURIComponent(connection.shop)}` : "";
  const platformLabel = platform === "daraz" ? "Daraz" : "Shopify";

  const loadPreview = useCallback(async () => {
    if (connection?.initialSyncStatus !== "completed") return;
    setLoading(true);
    setError("");
    try {
      const data = await ecomApiGet(platform, `sync/import-preview${shopQuery}`, authFetch);
      setPreview(data);
    } catch (err) {
      setError(err.message || "Could not load import preview");
    } finally {
      setLoading(false);
    }
  }, [platform, authFetch, connection?.initialSyncStatus, connection?.shop, shopQuery]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (connection?.initialSyncStatus !== "completed") return null;
  if (!preview?.hasPendingImport && connection?.erpImportStatus === "completed") return null;

  const products = preview?.products?.summary || {};
  const customers = preview?.customers?.summary || {};
  const orders = preview?.orders?.summary || {};
  const conflictCount = Number(preview?.conflictCount || 0)
    + Number(products.conflict || 0)
    + Number(customers.conflict || 0)
    + Number(orders.conflict || 0);
  const readyCount =
    Number(products.create || 0) + Number(products.update || 0)
    + Number(customers.create || 0) + Number(customers.update || 0)
    + Number(orders.create || 0) + Number(orders.update || 0);

  const handleImported = (result) => {
    setPreview(result?.preview || preview);
    onImported?.(result);
    loadPreview();
  };

  return (
    <>
      <Card>
        <div className="wh-card-table__head" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 className="wh-card__title">Review before importing to ERP</h3>
            <p className="wh-muted" style={{ margin: "0.25rem 0 0" }}>
              {platformLabel} data is staged. New and matching records import automatically.
              If something already exists in your ERP, you choose Replace or Keep.
            </p>
          </div>
          <div className="wh-action-btns">
            <Button variant="secondary" className="wh-btn--sm" onClick={loadPreview} disabled={loading}>
              Refresh preview
            </Button>
            {preview?.hasPendingImport ? (
              <Button className="wh-btn--sm" onClick={() => setModalOpen(true)} disabled={loading}>
                Open review &amp; import
              </Button>
            ) : null}
          </div>
        </div>

        {loading && <p className="wh-muted">Loading preview…</p>}
        {error && <p className="wh-field__error">{error}</p>}

        {preview && !loading && (
          <>
            <p className="wh-muted" style={{ margin: "0 0 0.75rem" }}>
              Ready to import: <strong>{readyCount}</strong>
              {conflictCount > 0 ? (
                <> · Conflicts needing a choice: <strong>{conflictCount}</strong></>
              ) : null}
            </p>
            {!preview.hasPendingImport ? (
              <p className="wh-muted" style={{ margin: 0 }}>
                All staged records have been imported or skipped.
              </p>
            ) : null}
          </>
        )}
      </Card>

      <StoreSyncPreviewModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        platform={platform}
        authFetch={authFetch}
        connection={connection}
        onImported={handleImported}
      />
    </>
  );
}
