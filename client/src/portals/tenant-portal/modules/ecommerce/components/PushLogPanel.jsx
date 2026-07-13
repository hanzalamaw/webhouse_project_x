import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { formatDateTime } from "../../../../../utils/dateTime";

const ENTITY_LABEL = {
  customer: "Customer",
  order: "Order",
  product: "Product",
  inventory: "Inventory",
};

function entityFromSyncType(syncType) {
  return String(syncType || "").replace(/^erp_push:/, "");
}

export default function PushLogPanel({ platform = "shopify", authFetch: authFetchProp }) {
  const auth = useAuth();
  const authFetch = authFetchProp || auth.authFetch;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyFailed, setOnlyFailed] = useState(true);
  const [retryingKey, setRetryingKey] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ecomApiGet(
        platform,
        `sync/push-logs${onlyFailed ? "?onlyFailed=1" : ""}`,
        authFetch,
      );
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [platform, authFetch, onlyFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (log) => {
    const key = log.id ?? `${log.sync_type}:${log.external_id}`;
    setRetryingKey(key);
    setNotice("");
    try {
      await ecomApiPost(platform, "sync/push-retry", authFetch, {
        syncType: log.sync_type,
        entityType: entityFromSyncType(log.sync_type),
        externalId: log.external_id,
      });
      setNotice("Push retried successfully — the change is now in your store.");
      await load();
    } catch (err) {
      setNotice(err.message || "Retry failed. See the log entry for details.");
      await load();
    } finally {
      setRetryingKey(null);
    }
  };

  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div style={{ marginTop: "1rem" }}>
      <Card>
        <div className="wh-card-table__head" style={{ marginBottom: "0.75rem" }}>
          <div>
            <h3 className="wh-card__title">Store push activity</h3>
            <p className="wh-muted" style={{ margin: "0.35rem 0 0" }}>
              Changes you saved in the ERP and pushed back to your store. Retry any that failed.
            </p>
          </div>
          <div className="wh-action-btns">
            <label className="wh-checkbox-item" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={onlyFailed}
                onChange={(e) => setOnlyFailed(e.target.checked)}
              />
              <span>Failed only</span>
            </label>
            <Button variant="secondary" className="wh-btn--sm" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {notice && <p className="wh-form-message" style={{ marginBottom: "0.75rem" }}>{notice}</p>}

        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="wh-muted">
            {onlyFailed
              ? "No failed pushes. Everything you saved reached your store."
              : "No push activity yet. Edit a linked record and choose “Save & sync to Shopify”."}
          </p>
        ) : (
          <>
            {onlyFailed && failedCount > 0 && (
              <div className="wh-alert wh-alert--warning" style={{ marginBottom: "0.75rem" }}>
                {failedCount} change{failedCount === 1 ? "" : "s"} did not reach your store.
                A common cause is missing write permission — reconnect the store to grant it, then retry.
              </div>
            )}
            <div className="wh-mini-list">
              {logs.map((log) => {
                const key = log.id ?? `${log.sync_type}:${log.external_id}`;
                const entity = entityFromSyncType(log.sync_type);
                const failed = log.status === "failed";
                return (
                  <div key={key} className="wh-mini-row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
                    <div className="wh-mini-row__main" style={{ flex: "1 1 260px" }}>
                      <div className="wh-mini-row__title">
                        {ENTITY_LABEL[entity] || entity} #{log.external_id}{" "}
                        <span
                          className={`wh-badge ${failed ? "wh-badge--danger" : "wh-badge--success"}`}
                          style={{ marginLeft: "0.4rem" }}
                        >
                          {failed ? "Failed" : "Sent"}
                        </span>
                      </div>
                      {log.message && (
                        <div className="wh-mini-row__sub">{log.message}</div>
                      )}
                      <div className="wh-mini-row__sub wh-muted">
                        {formatDateTime(log.synced_at)}
                      </div>
                    </div>
                    {failed && (
                      <div className="wh-action-btns">
                        <Button
                          className="wh-btn--sm"
                          disabled={retryingKey === key}
                          onClick={() => retry(log)}
                        >
                          {retryingKey === key ? "Retrying…" : "Retry push"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
