import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { formatDateTime } from "../../../../../utils/dateTime";
import { Kpi } from "./DashboardWidgets";
import { SYNC_STATUS_USER } from "../utils/friendlyMessages";
import OrderConflicts from "./OrderConflicts";

export default function ConnectedStoreSummary({
  platform,
  storeName,
  storeSubtitle,
  syncStatus,
  lastSyncedAt,
  counts,
  onDisconnect,
  onRetrySync,
  showRetry,
}) {
  const syncLabel = SYNC_STATUS_USER[syncStatus] || syncStatus || "—";

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
            <Button variant="danger" className="wh-btn--sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          </div>
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
              label="Sync status"
              value={syncLabel}
              hint={lastSyncedAt ? `Last updated ${formatDateTime(lastSyncedAt)}` : undefined}
              tone={syncStatus === "completed" ? "success" : syncStatus === "running" ? "warning" : "default"}
            />
          </div>
        </div>
      </Card>

      <OrderConflicts platform={platform} />
    </>
  );
}
