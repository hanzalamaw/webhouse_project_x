import { useCallback, useEffect, useState } from "react";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";
import { formatPKR } from "../../../../../utils/currency";
import { parseImportIssueMessage } from "../utils/importIssueMessages";

function EntityPreviewSection({ title, data, selected, onToggle }) {
  if (!data) return null;
  const { summary, samples } = data;
  const pending = (summary?.create || 0) + (summary?.update || 0);
  const skipCount = summary?.skip || 0;

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <input type="checkbox" checked={selected} onChange={onToggle} disabled={!pending && !summary?.create && !skipCount} />
        <strong>{title}</strong>
        <span className="wh-muted">
          — {summary?.create || 0} new, {summary?.update || 0} updates, {skipCount} skipped
          {(summary?.already_imported || 0) > 0 ? `, ${summary.already_imported} already in ERP` : ""}
        </span>
      </label>

      {selected && (pending > 0 || skipCount > 0) && (
        <div className="wh-table-wrap">
          <table className="wh-table wh-table--compact">
            <thead>
              <tr>
                <th>Action</th>
                <th>Name / ID</th>
                <th>Why / how to fix</th>
              </tr>
            </thead>
            <tbody>
              {["create", "update", "skip"].flatMap((action) =>
                (samples?.[action] || []).map((row) => {
                  const parsed = parseImportIssueMessage(row.reason);
                  return (
                    <tr key={`${action}-${row.externalId}`}>
                      <td>
                        <span className={`wh-badge wh-badge--${action === "skip" ? "warning" : action === "update" ? "accent" : "success"}`}>
                          {action}
                        </span>
                      </td>
                      <td>{row.name || row.orderNo || row.externalId}</td>
                      <td className="wh-muted" style={{ fontSize: "0.85rem" }}>
                        {row.sku && <>SKU: {row.sku}<br /></>}
                        {row.price != null && <>Price: {formatPKR(row.price)}<br /></>}
                        {row.total != null && <>Total: {formatPKR(row.total)}<br /></>}
                        {row.email && <>{row.email}<br /></>}
                        {action === "skip" && (parsed.why || row.reason) ? (
                          <>
                            <strong>Why:</strong> {parsed.why || row.reason}
                            {parsed.fix ? (
                              <>
                                <br />
                                <strong>How to fix:</strong> {parsed.fix}
                              </>
                            ) : null}
                          </>
                        ) : (
                          row.reason || "—"
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ImportPreviewPanel({ platform, authFetch, connection, onImported }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [entities, setEntities] = useState({ product: true, customer: true, order: true });

  const shopQuery = connection?.shop ? `?shop=${encodeURIComponent(connection.shop)}` : "";

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
      const result = await ecomApiPost(platform, `sync/import${shopQuery}`, authFetch, {
        entities: selected,
        updateExisting: true,
      });
      setPreview(result.preview || preview);
      const parts = selected.map((t) => {
        const r = result.results?.[t];
        if (!r) return null;
        const failed = r.failed ? `, ${r.failed} failed` : "";
        return `${t}: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped${failed}`;
      }).filter(Boolean);
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

  return (
    <Card>
      <div className="wh-card-table__head" style={{ marginBottom: "1rem" }}>
        <div>
          <h3 className="wh-card__title">Review before importing to ERP</h3>
          <p className="wh-muted" style={{ margin: "0.25rem 0 0" }}>
            Your store data has been fetched. Choose what to add to inventory, CRM, and orders.
            Manual records with matching SKUs or emails are never overwritten.
          </p>
        </div>
        <Button variant="secondary" className="wh-btn--sm" onClick={loadPreview} disabled={loading}>
          Refresh preview
        </Button>
      </div>

      {loading && <p className="wh-muted">Loading preview…</p>}
      {error && <p className="wh-field__error">{error}</p>}
      {message && <p className="wh-form-message">{message}</p>}

      {preview && (
        <>
          <EntityPreviewSection
            title="Products"
            data={preview.products}
            selected={entities.product}
            onToggle={() => setEntities((e) => ({ ...e, product: !e.product }))}
          />
          <EntityPreviewSection
            title="Customers"
            data={preview.customers}
            selected={entities.customer}
            onToggle={() => setEntities((e) => ({ ...e, customer: !e.customer }))}
          />
          <EntityPreviewSection
            title="Orders"
            data={preview.orders}
            selected={entities.order}
            onToggle={() => setEntities((e) => ({ ...e, order: !e.order }))}
          />

          {preview.hasPendingImport ? (
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importing…" : "Import selected to ERP"}
            </Button>
          ) : (
            <p className="wh-muted">All staged records have been imported or skipped.</p>
          )}
        </>
      )}
    </Card>
  );
}
