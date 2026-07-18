import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../../../../../components/Modal";
import { Button } from "../../../../../components/Button";
import { formatPKR } from "../../../../../utils/currency";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";
import { Kpi } from "./DashboardWidgets";

const PREVIEW_LIMIT = 200;

function flattenSamples(data, actions = ["create", "update", "skip", "already_imported", "conflict"]) {
  if (!data?.samples) return [];
  return actions.flatMap((action) =>
    (data.samples[action] || []).map((row) => ({ ...row, action })),
  );
}

function ActionBadge({ action }) {
  const tone =
    action === "skip" || action === "already_imported"
      ? "warning"
      : action === "update"
        ? "accent"
        : action === "conflict"
          ? "danger"
          : "success";
  return <span className={`wh-badge wh-badge--${tone}`}>{action === "conflict" ? "match" : action}</span>;
}

function EntityTable({ title, data, columns, actions }) {
  const allRows = useMemo(() => flattenSamples(data, actions), [data, actions]);
  const rows = allRows.slice(0, PREVIEW_LIMIT);
  const summary = data?.summary || {};

  return (
    <section style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <strong>{title}</strong>
        <span className="wh-muted" style={{ fontSize: "0.9rem" }}>
          {(data?.total ?? 0)} staged · {summary.create || 0} new · {summary.conflict || 0} need review ·{" "}
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
            <p className="wh-muted" style={{ fontSize: "0.85rem", margin: "0.5rem 0 0" }}>
              Showing first {PREVIEW_LIMIT} of {allRows.length} rows.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DuplicateTable({
  title,
  rows,
  decisions,
  onDecision,
  onBulk,
  platformLabel,
}) {
  if (!rows.length) return null;
  const pending = rows.filter((row) => !decisions[String(row.externalId)]).length;

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <strong>Duplicates — {title} ({rows.length})</strong>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => onBulk("rely")}>
            Keep all ERP
          </Button>
          <Button type="button" variant="secondary" className="wh-btn--sm" onClick={() => onBulk("update")}>
            Keep all {platformLabel}
          </Button>
        </div>
      </div>
      <p className="wh-muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        Same record found in ERP and {platformLabel}. Click which side’s data to keep.
        {pending > 0 ? ` ${pending} still need a choice.` : ""}
      </p>
      <div className="wh-tx-payments-wrap" style={{ maxHeight: 360, overflow: "auto" }}>
        <table className="wh-tx-payments-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ERP</th>
              <th>{platformLabel}</th>
              <th>Keep</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PREVIEW_LIMIT).map((row, i) => {
              const id = String(row.externalId);
              const choice = decisions[id] || "";
              const storeLabel = row.name || row.orderNo || row.sku || row.externalId || "—";
              const erpLabel = row.conflictWith || "Existing ERP record";
              return (
                <tr key={`dup-${id}-${i}`} style={choice ? undefined : { background: "rgba(220, 160, 40, 0.08)" }}>
                  <td>{i + 1}</td>
                  <td>
                    <div>{erpLabel}</div>
                    {row.conflictSource ? (
                      <div className="wh-muted" style={{ fontSize: "0.8rem" }}>source: {row.conflictSource}</div>
                    ) : null}
                    {row.sku ? <div className="wh-muted" style={{ fontSize: "0.8rem" }}>SKU {row.sku}</div> : null}
                  </td>
                  <td>
                    <div>{storeLabel}</div>
                    {row.sku ? <div className="wh-muted" style={{ fontSize: "0.8rem" }}>SKU {row.sku}</div> : null}
                    {row.email || row.phone ? (
                      <div className="wh-muted" style={{ fontSize: "0.8rem" }}>
                        {[row.email, row.phone].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                    {row.price != null ? (
                      <div className="wh-muted" style={{ fontSize: "0.8rem" }}>{formatPKR(row.price)}</div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      <Button
                        type="button"
                        variant={choice === "rely" ? "primary" : "secondary"}
                        className="wh-btn--sm"
                        onClick={() => onDecision(id, "rely")}
                      >
                        ERP
                      </Button>
                      <Button
                        type="button"
                        variant={choice === "update" ? "primary" : "secondary"}
                        className="wh-btn--sm"
                        onClick={() => onDecision(id, "update")}
                      >
                        {platformLabel}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Sync review modal: new records import directly; duplicates use ERP vs store keep buttons.
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
  const [conflictDecisions, setConflictDecisions] = useState({
    product: {},
    customer: {},
    order: {},
  });

  const shopQuery = connection?.shop ? `?shop=${encodeURIComponent(connection.shop)}&full=1` : "?full=1";
  const counts = connection?.counts || {};
  const placeNoun = platform === "daraz" ? "warehouses" : "locations";
  const platformLabel = platform === "daraz" ? "Daraz" : "Shopify";

  const productMatches = useMemo(
    () => flattenSamples(preview?.products, ["conflict"]),
    [preview],
  );
  const customerMatches = useMemo(
    () => flattenSamples(preview?.customers, ["conflict"]),
    [preview],
  );
  const orderMatches = useMemo(
    () => flattenSamples(preview?.orders, ["conflict"]),
    [preview],
  );

  const unresolvedMatches = useMemo(() => {
    const missing = (rows, map) => rows.some((row) => !map[String(row.externalId)]);
    return (
      (entities.product && missing(productMatches, conflictDecisions.product || {}))
      || (entities.customer && missing(customerMatches, conflictDecisions.customer || {}))
      || (entities.order && missing(orderMatches, conflictDecisions.order || {}))
    );
  }, [
    entities,
    productMatches,
    customerMatches,
    orderMatches,
    conflictDecisions,
  ]);

  const loadPreview = useCallback(async () => {
    if (!open || !connection?.connected) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await ecomApiGet(platform, `sync/import-preview${shopQuery}`, authFetch);
      setPreview(data);
      // No default — user must pick ERP or store for each duplicate.
      setConflictDecisions({ product: {}, customer: {}, order: {} });
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

  const setDecision = (entityType, externalId, value) => {
    setConflictDecisions((prev) => ({
      ...prev,
      [entityType]: { ...prev[entityType], [externalId]: value },
    }));
  };

  const setBulk = (entityType, rows, value) => {
    const map = {};
    for (const row of rows) map[String(row.externalId)] = value;
    setConflictDecisions((prev) => ({
      ...prev,
      [entityType]: { ...prev[entityType], ...map },
    }));
  };

  const handleImport = async () => {
    const selected = Object.entries(entities)
      .filter(([, on]) => on)
      .map(([key]) => key);
    if (!selected.length) {
      setError("Select at least one data type to import");
      return;
    }
    if (unresolvedMatches) {
      setError(`Choose ERP or ${platformLabel} for every duplicate before importing.`);
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
        conflictDecisions,
        defaultConflictAction: null,
      });
      setPreview(result.preview || preview);
      const parts = selected
        .map((t) => {
          const r = result.results?.[t];
          if (!r) return null;
          const failed = r.failed ? `, ${r.failed} failed` : "";
          const relied = r.relied ? `, ${r.relied} kept ERP` : "";
          return `${t}: ${r.created} new, ${r.updated} from store${relied}, ${r.skipped} skipped${failed}`;
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
          + (sample.length ? sample.join(" ") : "See details below."),
        );
      }
      onImported?.(result);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const readyActions = ["create", "already_imported", "skip"];

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
  ];

  const customerCols = [
    { key: "action", label: "Action", render: (r) => <ActionBadge action={r.action} /> },
    { key: "name", label: "Customer", render: (r) => r.name || r.externalId || "—" },
    { key: "email", label: "Email", render: (r) => r.email || "—" },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
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
  ];

  const matchCount = productMatches.length + customerMatches.length + orderMatches.length;

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
            <Button modalPrimary onClick={handleImport} disabled={importing || loading || unresolvedMatches}>
              {importing
                ? "Importing…"
                : unresolvedMatches
                  ? "Choose ERP or store for duplicates"
                  : matchCount
                    ? "Import (with your choices)"
                    : "Import selected to ERP"}
            </Button>
          ) : null}
        </>
      }
    >
      <p className="wh-modal__text">
        Sync finished
        {connection?.storeName || connection?.shop
          ? ` from ${connection.storeName || connection.shop}`
          : ""}
        . New records import normally. Duplicates are listed below — pick <strong>ERP</strong> or{" "}
        <strong>{platformLabel}</strong> for each one.
      </p>
      {platform === "daraz" ? (
        <p className="wh-muted" style={{ fontSize: "0.85rem", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Daraz customers usually come from orders. Map warehouses under Locations so stock imports land correctly.
        </p>
      ) : (
        <p className="wh-muted" style={{ fontSize: "0.85rem", marginTop: "-0.5rem", marginBottom: "1rem" }}>
          “Customers fetched” is Shopify’s customer list. CRM may show more because guest checkout buyers
          are created from orders.
        </p>
      )}

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
            <DuplicateTable
              title="Products"
              rows={productMatches}
              decisions={conflictDecisions.product}
              onDecision={(id, value) => setDecision("product", id, value)}
              onBulk={(value) => setBulk("product", productMatches, value)}
              platformLabel={platformLabel}
            />
          )}
          {entities.customer && (
            <DuplicateTable
              title="Customers"
              rows={customerMatches}
              decisions={conflictDecisions.customer}
              onDecision={(id, value) => setDecision("customer", id, value)}
              onBulk={(value) => setBulk("customer", customerMatches, value)}
              platformLabel={platformLabel}
            />
          )}
          {entities.order && (
            <DuplicateTable
              title="Orders"
              rows={orderMatches}
              decisions={conflictDecisions.order}
              onDecision={(id, value) => setDecision("order", id, value)}
              onBulk={(value) => setBulk("order", orderMatches, value)}
              platformLabel={platformLabel}
            />
          )}

          {entities.product && (
            <EntityTable title="Products (new / already linked)" data={preview.products} columns={productCols} actions={readyActions} />
          )}
          {entities.customer && (
            <EntityTable title="Customers (new / already linked)" data={preview.customers} columns={customerCols} actions={readyActions} />
          )}
          {entities.order && (
            <EntityTable title="Orders (new / already linked)" data={preview.orders} columns={orderCols} actions={readyActions} />
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
