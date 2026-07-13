import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../../../components/Button";
import { ProductIcon, TransferIcon } from "../../../../../components/icons";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";

const PLATFORM_LABELS = {
  shopify: "Shopify",
  daraz: "Daraz",
};

/**
 * One-click import of pending store products into ERP inventory (no Integrations trip).
 */
export function PendingStoreProductsImport({
  embedded = false,
  platform,
  authFetch,
  connection,
  shopQuery = "",
  onImported,
  disabled = false,
}) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPreview = useCallback(async () => {
    if (!platform || connection?.initialSyncStatus !== "completed") return;
    setLoading(true);
    setError("");
    try {
      const data = await ecomApiGet(platform, `sync/import-preview${shopQuery}`, authFetch);
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [platform, authFetch, connection?.initialSyncStatus, shopQuery]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (!platform || connection?.initialSyncStatus !== "completed") return null;

  const productSummary = preview?.products?.summary;
  const pending = (productSummary?.create || 0) + (productSummary?.update || 0);
  const platformLabel = PLATFORM_LABELS[platform] || platform;
  const storeLabel = connection?.storeName || platformLabel;

  if (!embedded && !loading && pending === 0) return null;

  const handleImport = async () => {
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const result = await ecomApiPost(platform, `sync/import${shopQuery}`, authFetch, {
        entities: ["product"],
        updateExisting: true,
      });
      const r = result.results?.product;
      setMessage(
        r
          ? `Imported ${r.created} new and updated ${r.updated} in inventory.`
          : "Store products imported to inventory.",
      );
      setPreview(result.preview || preview);
      onImported?.(result);
      await loadPreview();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const content = (
    <div className={`wh-product-sync-card wh-product-sync-card--import${pending > 0 ? " wh-product-sync-card--active" : ""}`}>
      <div className="wh-product-sync-card__head">
        <div className="wh-product-sync-card__icon wh-product-sync-card__icon--accent">
          <ProductIcon />
        </div>
        <div className="wh-product-sync-card__intro">
          <div className="wh-product-sync-card__title-row">
            <p className="wh-product-sync-card__title">Import from store</p>
            <span className="wh-badge wh-badge--accent wh-product-sync-card__badge">{platformLabel}</span>
          </div>
          <p className="wh-product-sync-card__desc">
            Pull waiting products from {storeLabel} into your inventory catalog.
          </p>
        </div>
      </div>

      <div className="wh-product-sync-card__body">
        {loading ? (
          <div className="wh-product-sync-loading">
            <span className="wh-product-sync-loading__bar" />
            <span className="wh-muted">Checking store catalog…</span>
          </div>
        ) : pending > 0 ? (
          <>
            <div className="wh-product-sync-stat">
              <span className="wh-product-sync-stat__value">{pending}</span>
              <span className="wh-product-sync-stat__label">
                product{pending === 1 ? "" : "s"} ready
              </span>
            </div>
            <div className="wh-product-sync-meta">
              {(productSummary?.create || 0) > 0 && (
                <span className="wh-product-sync-meta__chip wh-product-sync-meta__chip--success">
                  {productSummary.create} new
                </span>
              )}
              {(productSummary?.update || 0) > 0 && (
                <span className="wh-product-sync-meta__chip wh-product-sync-meta__chip--accent">
                  {productSummary.update} updates
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="wh-product-sync-card__empty wh-muted">
            <TransferIcon />
            <span>All store products are already in inventory.</span>
          </p>
        )}

        {error && <p className="wh-field__error wh-product-sync-card__alert">{error}</p>}
        {message && <p className="wh-form-message wh-product-sync-card__alert">{message}</p>}

        <div className="wh-product-sync-card__actions">
          <Button
            type="button"
            onClick={handleImport}
            disabled={disabled || importing || loading || pending === 0}
            className="wh-btn--sm"
          >
            {importing ? "Importing…" : "Import to inventory"}
          </Button>
          <button
            type="button"
            className="wh-product-sync-card__link"
            onClick={loadPreview}
            disabled={loading || importing}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) return content;

  if (!loading && pending === 0) return null;

  return (
    <div className="wh-form-block">
      <div className="wh-form-block__header">
        <h3 className="wh-form-block__title">Store products → inventory</h3>
        <p className="wh-form-block__desc">Import pending catalog items from {storeLabel}.</p>
      </div>
      <div className="wh-form-block__body">{content}</div>
    </div>
  );
}
