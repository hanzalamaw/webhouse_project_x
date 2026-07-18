import { useCallback, useEffect, useState } from "react";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { formatDateTime } from "../../../../../utils/dateTime";
import { ecomApiGet } from "../api/ecommerceClient";
import { parseImportIssueMessage } from "../utils/importIssueMessages";

function statusLabel(status) {
  if (status === "skipped") return "Skipped";
  if (status === "failed") return "Failed";
  if (status === "partial") return "Partial";
  return status || "—";
}

function statusTone(status) {
  if (status === "skipped") return "warning";
  if (status === "failed") return "danger";
  return "accent";
}

/**
 * Shows ERP import failures and skips with why + how to fix (ERP and/or store).
 */
export default function ImportFailureLog({ platform, authFetch, connection }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const shopQuery = connection?.shop
    ? `?shop=${encodeURIComponent(connection.shop)}&onlyFailed=1&prefix=${encodeURIComponent("erp_import:")}`
    : `?onlyFailed=1&prefix=${encodeURIComponent("erp_import:")}`;

  const load = useCallback(async () => {
    if (!connection?.connected) return;
    setLoading(true);
    setError("");
    try {
      const data = await ecomApiGet(platform, `sync/logs${shopQuery}`, authFetch);
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (err) {
      setError(err.message || "Could not load import issues");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [platform, authFetch, connection?.connected, connection?.shop, shopQuery]);

  useEffect(() => {
    load();
  }, [load, connection?.lastSyncedAt, connection?.pendingImportCount]);

  if (!connection?.connected) return null;

  return (
    <Card>
      <div className="wh-card-table__head" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h3 className="wh-card__title">Why some records weren’t imported</h3>
          <p className="wh-muted" style={{ margin: "0.25rem 0 0" }}>
            Each row explains what went wrong and how to fix it in your ERP or in the store.
          </p>
        </div>
        <Button variant="secondary" className="wh-btn--sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && <p className="wh-field__error">{error}</p>}

      {!loading && logs.length === 0 ? (
        <p className="wh-muted" style={{ margin: 0 }}>No skipped or failed imports for this store.</p>
      ) : (
        <div className="wh-tx-payments-wrap" style={{ maxHeight: 360, overflow: "auto" }}>
          <table className="wh-tx-payments-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Status</th>
                <th>Record</th>
                <th>Why it was skipped</th>
                <th>How to fix</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const { why, fix } = parseImportIssueMessage(log.message);
                return (
                  <tr key={`${log.synced_at}-${log.external_id}-${i}`}>
                    <td>{log.synced_at ? formatDateTime(log.synced_at) : "—"}</td>
                    <td>{String(log.sync_type || "").replace(/^erp_import:/, "")}</td>
                    <td>
                      <span className={`wh-badge wh-badge--${statusTone(log.status)}`}>
                        {statusLabel(log.status)}
                      </span>
                    </td>
                    <td>{log.external_id || "—"}</td>
                    <td style={{ maxWidth: 280 }}>{why}</td>
                    <td style={{ maxWidth: 320 }}>
                      {fix || (
                        <span className="wh-muted">
                          Fix the conflict in Inventory/CRM or in the store, then Re-sync and import again.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
