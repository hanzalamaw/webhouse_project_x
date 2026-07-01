import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatDateTime } from "../../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../../utils/sessionDisplay";

export default function ActivityAlertView() {
  const { alertId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("admin");
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
          title={alert.title}
          description="Security or configuration event details."
          actions={
            <Button variant="secondary" onClick={() => navigate("/app/m/admin/activity-alerts")}>
              Back to alerts
            </Button>
          }
        />

        <DetailGrid>
          <DetailValue label="Type">{alert.alert_type?.replace(/_/g, " ") || "—"}</DetailValue>
          <DetailValue label="Priority">{alert.priority || "—"}</DetailValue>
          <DetailValue label="Status">
            {alert.is_read ? <StatusBadge status="inactive" /> : <StatusBadge status="pending" />}
          </DetailValue>
          <DetailValue label="When">{formatDateTime(alert.created_at)}</DetailValue>
          <DetailValue label="IP address">{formatSessionIp(alert.ip_address)}</DetailValue>
          <DetailValue label="Device">{simplifyDeviceInfo(alert.device_info)}</DetailValue>
          <DetailValue label="Message" fullWidth multiline>{alert.message || "—"}</DetailValue>
        </DetailGrid>
      </FormPageLayout>
    </div>
  );
}
