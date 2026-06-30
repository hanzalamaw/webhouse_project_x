import { useState } from "react";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { formatDateTime } from "../../../../../utils/dateTime";
import { Kpi } from "./DashboardWidgets";
import { SYNC_STATUS_USER, ERP_IMPORT_STATUS_USER } from "../utils/friendlyMessages";
import OrderConflicts from "./OrderConflicts";
import DisconnectStoreModal from "./DisconnectStoreModal";
import ImportPreviewPanel from "./ImportPreviewPanel";

export default function ConnectedStoreSummary({
  platform,
  storeName,
  storeSubtitle,
  syncStatus,
  erpImportStatus,
  lastSyncedAt,
  counts,
  pendingImportCount,
  pendingConflictCount,
  apiAccess,
  connection,
  authFetch,
  onDisconnect,
  onRetrySync,
  onImported,
  showRetry,
}) {
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const syncLabel = SYNC_STATUS_USER[syncStatus] || syncStatus || "—";
  const importLabel = ERP_IMPORT_STATUS_USER[erpImportStatus] || erpImportStatus || "—";

  const handleDisconnected = () => {
    setDisconnectOpen(false);
    onDisconnect?.();
  };

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
              <Button variant="secondary" className="wh-btn--sm" onClick={onRetrySync}>
                Sync again
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
