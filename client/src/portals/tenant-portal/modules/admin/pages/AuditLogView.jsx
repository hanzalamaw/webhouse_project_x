import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { DiffViewer } from "../../../../../components/DiffViewer";
import { DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatDateTime } from "../../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../../utils/sessionDisplay";
import { formatTenantAuditAction } from "../../../../../utils/auditActionLabels";

export default function AuditLogView() {
  const { logId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchAllTableRows("/tenant/audit-logs", authFetch);
      const row = rows.find((r) => String(r.id) === String(logId));
      if (!row) throw new Error("Audit log not found");
      setLog(row);
    } catch (e) {
      setLog(null);
      setError(e.message || "Audit log not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, logId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!log) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Audit log not found"}</div>
          <Button variant="secondary" onClick={() => navigate("/app/m/admin/audit-logs")}>Back to audit logs</Button>
        </FormPageLayout>
      </div>
    );
  }

  const oldValue = typeof log.old_value === "string" ? JSON.parse(log.old_value || "null") : log.old_value;
  const newValue = typeof log.new_value === "string" ? JSON.parse(log.new_value || "null") : log.new_value;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={formatTenantAuditAction(log.action)}
          description="Full audit log entry with change details."
          actions={
            <Button variant="secondary" onClick={() => navigate("/app/m/admin/audit-logs")}>
              Back to audit logs
            </Button>
          }
        />

        <DetailGrid>
          <DetailValue label="Action">{formatTenantAuditAction(log.action)}</DetailValue>
          <DetailValue label="User">{log.user_name || "—"}</DetailValue>
          <DetailValue label="Module">{log.module_name || "—"}</DetailValue>
          <DetailValue label="When">{formatDateTime(log.created_at)}</DetailValue>
          <DetailValue label="IP address">{formatSessionIp(log.ip_address)}</DetailValue>
          <DetailValue label="Device">{simplifyDeviceInfo(log.device_info)}</DetailValue>
        </DetailGrid>

        <div className="wh-panel" style={{ marginTop: 24 }}>
          <div className="wh-panel__head">
            <h3 className="wh-panel__title">Changes</h3>
            <p className="wh-panel__subtitle">Previous values in green, updated values in red.</p>
          </div>
          <div className="wh-panel__body">
            <DiffViewer oldValue={oldValue} newValue={newValue} />
          </div>
        </div>
      </FormPageLayout>
    </div>
  );
}
