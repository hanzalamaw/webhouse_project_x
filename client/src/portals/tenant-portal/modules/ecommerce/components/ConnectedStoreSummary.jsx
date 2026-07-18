import { useState } from "react";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { formatDateTime } from "../../../../../utils/dateTime";
import { Kpi } from "./DashboardWidgets";
import { SYNC_STATUS_USER, ERP_IMPORT_STATUS_USER } from "../utils/friendlyMessages";
import OrderConflicts from "./OrderConflicts";
import DisconnectStoreModal from "./DisconnectStoreModal";
import ImportPreviewPanel from "./ImportPreviewPanel";
import PushLogPanel from "./PushLogPanel";
import LocationMappingPanel from "./LocationMappingPanel";

export default function ConnectedStoreSummary({
  platform,
  storeName,
  storeSubtitle,
  syncStatus,
  erpImportStatus,
  lastSyncedAt,
  counts = {},
  pendingImportCount,
  pendingConflictCount,
  unmappedLocationCount,
  apiAccess,
  connection,
  authFetch,
  onDisconnect,
  onRetrySync,
  onImported,
  showRetry,
  retryLabel = "Sync again",
  retryBusy = false,
  autoSyncEnabled = true,
  autoSyncSaving = false,
  onAutoSyncChange,
}) {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const syncLabel = SYNC_STATUS_USER[syncStatus] || syncStatus || "—";
  const importLabel = ERP_IMPORT_STATUS_USER[erpImportStatus] || erpImportStatus || "—";
  const placeNoun = platform === "daraz" ? "Warehouses" : "Locations";
  const unmapped = Number(
    unmappedLocationCount ?? connection?.unmappedLocationCount ?? 0,
  );

  const granted = new Set(
    String(connection?.grantedScopes || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const missingWriteScopes = (connection?.requiredScopes || []).filter(
    (s) => s.startsWith("write_") && !granted.has(s),
  );

  const handleDisconnected = () => {
    setDisconnectOpen(false);
    onDisconnect?.();
  };

  const autoSyncHint = platform === "daraz"
    ? (autoSyncEnabled
      ? "New Daraz data imports into your ERP automatically after fetch. Map warehouses below so stock lands correctly."
      : "New store data is fetched but stays in staging until you import manually.")
    : (autoSyncEnabled
      ? "Shopify changes import automatically (webhooks + every 5 min). No need to open this page."
      : "New store data is fetched but stays in staging until you import manually.");

  return (
    <>
      <Card>
        <div className="wh-card-table__head" style={{ marginBottom: "1rem" }}>
          <div>
            <h3 className="wh-card__title">{storeName}</h3>
            {storeSubtitle && (
              <p className="wh-muted" style={{ margin: "0.25rem 0 0" }}>
                {storeSubtitle}
              </p>
            )}
          </div>
          <div className="wh-action-btns">
            {showRetry && (
              <Button variant="secondary" className="wh-btn--sm" onClick={onRetrySync} disabled={retryBusy}>
                {retryBusy ? "Syncing…" : retryLabel}
              </Button>
            )}
            <Button variant="danger" className="wh-btn--sm" onClick={() => setDisconnectOpen(true)}>
              Disconnect
            </Button>
          </div>
        </div>

        {apiAccess && !apiAccess.ok && apiAccess.setupMessage && (
          <p className="wh-form-message" style={{ marginBottom: "1rem" }}>
            {apiAccess.setupMessage}
          </p>
        )}

        {platform === "shopify" && missingWriteScopes.length > 0 && (
          <div className="wh-alert wh-alert--warning" style={{ marginBottom: "1rem" }}>
            <strong>Changes can’t be pushed to your store yet.</strong> This connection is missing write
            permission ({missingWriteScopes.join(", ")}). Disconnect and reconnect the store to grant it,
            then your ERP edits will sync back to Shopify.
          </div>
        )}

        <div
          className="wh-inv-checkbox-inline"
          style={{ marginBottom: "1.25rem", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", background: "var(--surface-bg)" }}
        >
          <label className="wh-checkbox-item" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={Boolean(autoSyncEnabled)}
              disabled={autoSyncSaving || !onAutoSyncChange}
              onChange={(e) => onAutoSyncChange?.(e.target.checked)}
            />
            <span>
              <strong>Auto-sync to ERP</strong>
              <span className="wh-muted" style={{ display: "block", marginTop: "0.2rem", fontWeight: 400 }}>
                {autoSyncHint}
              </span>
            </span>
          </label>
        </div>

        <div className="wh-dash-grid">
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
              label={`${placeNoun} fetched`}
              value={counts.location ?? 0}
              hint={unmapped > 0 ? `${unmapped} need mapping` : undefined}
              tone={unmapped > 0 ? "warning" : "default"}
            />
          </div>
          <div className="wh-dash-col-3">
            <Kpi
              label="Sync status"
              value={syncLabel}
              hint={lastSyncedAt ? `Last updated ${formatDateTime(lastSyncedAt)}` : undefined}
              tone={syncStatus === "completed" ? "success" : syncStatus === "running" ? "warning" : "default"}
            />
          </div>
          <div className="wh-dash-col-3">
            <Kpi
              label="ERP import"
              value={importLabel}
              hint={
                pendingImportCount > 0
                  ? `${pendingImportCount} record(s) ready to review`
                  : undefined
              }
              tone={
                erpImportStatus === "completed"
                  ? "success"
                  : pendingImportCount > 0
                    ? "warning"
                    : "default"
              }
            />
          </div>
          {(pendingConflictCount ?? 0) > 0 && (
            <div className="wh-dash-col-3">
              <Kpi label="Order conflicts" value={pendingConflictCount} tone="warning" />
            </div>
          )}
        </div>
      </Card>

      <ImportPreviewPanel
        platform={platform}
        authFetch={authFetch}
        connection={connection}
        onImported={onImported}
      />

      {platform === "shopify" || platform === "daraz" ? (
        <>
          <LocationMappingPanel platform={platform} authFetch={authFetch} />
          <PushLogPanel platform={platform} authFetch={authFetch} />
        </>
      ) : null}

      <OrderConflicts platform={platform} />

      <DisconnectStoreModal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        platform={platform}
        storeName={storeName}
        authFetch={authFetch}
        onDisconnected={handleDisconnected}
      />
    </>
  );
}
