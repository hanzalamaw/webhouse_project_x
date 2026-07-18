import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../../../../../components/Modal";
import { Button } from "../../../../../components/Button";
import { formatPKR } from "../../../../../utils/currency";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";
import { Kpi } from "./DashboardWidgets";
import { parseImportIssueMessage } from "../utils/importIssueMessages";

const PREVIEW_LIMIT = 200;

function flattenSamples(data) {
  if (!data?.samples) return [];
  return ["create", "update", "skip", "already_imported"].flatMap((action) =>
    (data.samples[action] || []).map((row) => ({ ...row, action })),
  );
}

function EntityTable({ title, data, columns }) {
  const allRows = useMemo(() => flattenSamples(data), [data]);
  const rows = allRows.slice(0, PREVIEW_LIMIT);
  const summary = data?.summary || {};

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <strong>{title}</strong>
        <span className="wh-muted" style={{ fontSize: "0.9rem" }}>
          {(data?.total ?? 0)} staged · {summary.create || 0} new · {summary.update || 0} update ·{" "}
          {summary.skip || 0} skip
          {(summary.already_imported || 0) > 0 ? ` · ${summary.already_imported} already in ERP` : ""}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="wh-muted" style={{ margin: 0 }}>No staged {title.toLowerCase()} for this sync.</p>
      ) : (
        <div className="wh-tx-payments-wrap" style={{ maxHeight: 240, overflow: "auto" }}>
          <table className="wh-tx-payments-table">
            <thead>
              <tr>
                <th>#</th>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.action}-${row.externalId}-${i}`}>
                  <td>{i + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key}>{col.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {allRows.length > PREVIEW_LIMIT && (
            <p className="wh-muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              Showing first {PREVIEW_LIMIT} of {allRows.length} rows.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ActionBadge({ action }) {
  const tone =
    action === "skip" || action === "already_imported"
      ? "warning"
      : action === "update"
        ? "accent"
        : "success";
  return <span className={`wh-badge wh-badge--${tone}`}>{action}</span>;
}

/**
 * CSV-style review modal opened after a store sync finishes.
 * Shows fetched counts + staged product/customer/order details.
 */
export default function StoreSyncPreviewModal({
  open,
  onClose,
  platform,
  authFetch,
  connection,
  onImported,
}) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [entities, setEntities] = useState({ product: true, customer: true, order: true });

  const shopQuery = connection?.shop ? `?shop=${encodeURIComponent(connection.shop)}&full=1` : "?full=1";
  const counts = connection?.counts || {};
  const placeNoun = platform === "daraz" ? "warehouses" : "locations";
  const platformLabel = platform === "daraz" ? "Daraz" : "Shopify";

  const loadPreview = useCallback(async () => {
    if (!open || !connection?.connected) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await ecomApiGet(platform, `sync/import-preview${shopQuery}`, authFetch);
      setPreview(data);
    } catch (err) {
      setError(err.message || "Could not load sync details");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [open, connection?.connected, platform, authFetch, shopQuery]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleImport = async () => {
    const selected = Object.entries(entities)
      .filter(([, on]) => on)
      .map(([key]) => key);
    if (!selected.length) {
      setError("Select at least one data type to import");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const importQs = connection?.shop ? `?shop=${encodeURIComponent(connection.shop)}` : "";
      const result = await ecomApiPost(platform, `sync/import${importQs}`, authFetch, {
        entities: selected,
        updateExisting: true,
      });
      setPreview(result.preview || preview);
      const parts = selected
        .map((t) => {
          const r = result.results?.[t];
          if (!r) return null;
          const failed = r.failed ? `, ${r.failed} failed` : "";
          return `${t}: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped${failed}`;
        })
        .filter(Boolean);
      setMessage(parts.length ? `Import complete — ${parts.join(" · ")}` : "Import complete");
      const issues = [
        ...(Array.isArray(result.failures) ? result.failures : []),
        ...(Array.isArray(result.skips) ? result.skips : []),
      ];
      if (issues.length) {
        const sample = issues.slice(0, 3).map((i) => i.reason).filter(Boolean);
        setError(
          `${issues.length} record(s) were not imported. `
          + (sample.length ? sample.join(" ") : "See “Why some records weren’t imported” below."),
        );
      }
      onImported?.(result);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const productCols = [
    { key: "action", label: "Action", render: (r) => <ActionBadge action={r.action} /> },
    { key: "name", label: "Product", render: (r) => r.name || r.externalId || "—" },
    { key: "sku", label: "SKU", render: (r) => r.sku || "—" },
    {
      key: "price",
      label: "Price",
      render: (r) => (r.price != null ? formatPKR(r.price) : "—"),
    },
    { key: "stock", label: "Stock", render: (r) => (r.stock != null ? r.stock : "—") },
    {
      key: "reason",
      label: "Why / how to fix",
      render: (r) => {
        if (!r.reason) return "—";
        const { why, fix } = parseImportIssueMessage(r.reason);
        return (
          <div style={{ maxWidth: 320, fontSize: "0.85rem" }}>
            <div>{why}</div>
            {fix ? <div className="wh-muted" style={{ marginTop: "0.25rem" }}><strong>Fix:</strong> {fix}</div> : null}
          </div>
        );
      },
    },
  ];

  const customerCols = [
    { key: "action", label: "Action", render: (r) => <ActionBadge action={r.action} /> },
    { key: "name", label: "Customer", render: (r) => r.name || r.externalId || "—" },
    { key: "email", label: "Email", render: (r) => r.email || "—" },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
    {
      key: "reason",
      label: "Why / how to fix",
      render: (r) => {
        if (!r.reason) return "—";
        const { why, fix } = parseImportIssueMessage(r.reason);
        return (
          <div style={{ maxWidth: 320, fontSize: "0.85rem" }}>
            <div>{why}</div>
            {fix ? <div className="wh-muted" style={{ marginTop: "0.25rem" }}><strong>Fix:</strong> {fix}</div> : null}
          </div>
        );
      },
    },
  ];

  const orderCols = [
    { key: "action", label: "Action", render: (r) => <ActionBadge action={r.action} /> },
    { key: "orderNo", label: "Order", render: (r) => r.orderNo || r.externalId || "—" },
    { key: "customer", label: "Customer", render: (r) => r.customer || "—" },
    {
      key: "total",
      label: "Total",
      render: (r) => (r.total != null ? formatPKR(r.total) : "—"),
    },
    { key: "status", label: "Status", render: (r) => r.status || "—" },
    { key: "items", label: "Items", render: (r) => r.itemCount ?? "—" },
    {
      key: "reason",
      label: "Why / how to fix",
      render: (r) => {
        if (!r.reason) return "—";
        const { why, fix } = parseImportIssueMessage(r.reason);
        return (
          <div style={{ maxWidth: 320, fontSize: "0.85rem" }}>
            <div>{why}</div>
            {fix ? <div className="wh-muted" style={{ marginTop: "0.25rem" }}><strong>Fix:</strong> {fix}</div> : null}
          </div>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${platformLabel} sync — fetched data`}
      className="wh-modal--transaction wh-modal--transaction-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Close
          </Button>
          {preview?.hasPendingImport ? (
            <Button modalPrimary onClick={handleImport} disabled={importing || loading}>
              {importing ? "Importing…" : "Import selected to ERP"}
            </Button>
          ) : null}
        </>
      }
    >
      <p className="wh-modal__text">
        Sync finished. Review everything fetched from the store
        {connection?.storeName || connection?.shop
          ? ` (${connection.storeName || connection.shop})`
          : ""}
        . Nothing new is written to your ERP until you import.
      </p>
      <p className="wh-muted" style={{ fontSize: "0.85rem", marginTop: "-0.5rem", marginBottom: "1rem" }}>
        “Customers fetched” is Shopify’s customer list (accounts). CRM may show more because guest
        checkout buyers are created from orders. “Orders fetched” is staging — Order Management only
        lists orders successfully imported into the ERP.
      </p>

      <div className="wh-dash-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="wh-dash-col-3">
          <Kpi label="Orders fetched" value={counts.order ?? 0} tone="accent" />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Products fetched" value={counts.product ?? 0} />
        </div>
        <div className="wh-dash-col-3">
          <Kpi label="Customers fetched" value={counts.customer ?? 0} />
        </div>
        <div className="wh-dash-col-3">
          <Kpi
            label={`${placeNoun[0].toUpperCase() + placeNoun.slice(1)} fetched`}
            value={counts.location ?? 0}
          />
        </div>
      </div>

      {loading && <p className="wh-muted">Loading fetched records…</p>}
      {error && <p className="wh-field__error">{error}</p>}
      {message && <p className="wh-form-message">{message}</p>}

      {preview && !loading && (
        <>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            {[
              ["product", "Products"],
              ["customer", "Customers"],
              ["order", "Orders"],
            ].map(([key, label]) => (
              <label key={key} className="wh-checkbox-item" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(entities[key])}
                  onChange={() => setEntities((e) => ({ ...e, [key]: !e[key] }))}
                />
                <span>Import {label}</span>
              </label>
            ))}
          </div>

          {entities.product && (
            <EntityTable title="Products" data={preview.products} columns={productCols} />
          )}
          {entities.customer && (
            <EntityTable title="Customers" data={preview.customers} columns={customerCols} />
          )}
          {entities.order && (
            <EntityTable title="Orders" data={preview.orders} columns={orderCols} />
          )}

          {!preview.hasPendingImport && (
            <p className="wh-muted" style={{ margin: 0 }}>
              All staged records are already imported or skipped. Fetched totals above still reflect what is in sync staging.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
