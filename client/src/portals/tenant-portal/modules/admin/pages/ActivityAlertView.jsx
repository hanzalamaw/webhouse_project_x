import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import { Card } from "../../../../../components/Card";
import { StatusBadge } from "../../../../../components/Badge";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatDateTime } from "../../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../../utils/sessionDisplay";

function formatAlertType(value) {
  return value ? String(value).replace(/_/g, " ") : "—";
}

export default function ActivityAlertView() {
  const { alertId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchAllTableRows("/tenant/activity-alerts", authFetch);
      const row = rows.find((r) => String(r.id) === String(alertId));
      if (!row) throw new Error("Alert not found");
      setAlert(row);
    } catch (e) {
      setAlert(null);
      setError(e.message || "Alert not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, alertId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Alert not found"}</div>
          <Button variant="secondary" onClick={() => navigate("/app/m/admin/activity-alerts")}>Back to alerts</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Alert details"
          description="Security or configuration event details."
          actions={
            <Button variant="secondary" onClick={() => navigate("/app/m/admin/activity-alerts")}>
              Back to alerts
            </Button>
          }
        />

        <Card className="wh-logview-hero">
          <div className="wh-logview-hero__top">
            <span className="wh-logview-hero__action">{alert.title}</span>
            {alert.priority ? (
              <StatusBadge status={alert.priority} />
            ) : alert.is_read ? (
              <StatusBadge status="inactive" />
            ) : (
              <StatusBadge status="pending" />
            )}
          </div>
          <div className="wh-logview-hero__meta">
            <span>{formatAlertType(alert.alert_type)}</span>
            <span className="wh-logview-hero__dot">·</span>
            <span>{formatDateTime(alert.created_at)}</span>
          </div>
        </Card>

        <Card className="wh-logview-detail">
          <h3 className="wh-card__title">Details</h3>
          <DetailGrid>
            <DetailValue label="Type">{formatAlertType(alert.alert_type)}</DetailValue>
            <DetailValue label="Priority">{alert.priority || "—"}</DetailValue>
            <DetailValue label="Status">
              {alert.is_read ? <StatusBadge status="inactive" /> : <StatusBadge status="pending" />}
            </DetailValue>
            <DetailValue label="When">{formatDateTime(alert.created_at)}</DetailValue>
            <DetailValue label="IP address">{formatSessionIp(alert.ip_address)}</DetailValue>
            <DetailValue label="Device">{simplifyDeviceInfo(alert.device_info)}</DetailValue>
          </DetailGrid>
        </Card>

        <Card className="wh-logview-changes">
          <div className="wh-logview-changes__head">
            <h3 className="wh-card__title">What happened</h3>
            <p className="wh-muted">A plain-language summary of this alert.</p>
          </div>
          {alert.message ? (
            <p className="wh-logview-summary">{alert.message}</p>
          ) : (
            <p className="wh-muted">No additional details were recorded for this alert.</p>
          )}
        </Card>
      </FormPageLayout>
    </div>
  );
}
