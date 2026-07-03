import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import { Card } from "../../../../../components/Card";
import { StatusBadge } from "../../../../../components/Badge";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { DiffViewer } from "../../../../../components/DiffViewer";
import { DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { getAuditSummary, buildAuditChanges } from "../../../../../utils/humanizeAudit";
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
  const summary = getAuditSummary(newValue) || getAuditSummary(oldValue);
  const changes = buildAuditChanges(oldValue, newValue);

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Activity details"
          description="A plain-language record of what happened."
          actions={
            <Button variant="secondary" onClick={() => navigate("/app/m/admin/audit-logs")}>
              Back to audit logs
            </Button>
          }
        />

        <Card className="wh-logview-hero">
          <div className="wh-logview-hero__top">
            <span className="wh-logview-hero__action">{formatTenantAuditAction(log.action)}</span>
            {log.action && <StatusBadge status={log.action} />}
          </div>
          <div className="wh-logview-hero__meta">
            <span>{log.user_name || "System"}</span>
            <span className="wh-logview-hero__dot">·</span>
            <span>{formatDateTime(log.created_at)}</span>
          </div>
        </Card>

        <Card className="wh-logview-detail">
          <h3 className="wh-card__title">Details</h3>
          <DetailGrid>
            <DetailValue label="Performed by">{log.user_name || "—"}</DetailValue>
            <DetailValue label="Module">{log.module_name || "—"}</DetailValue>
            <DetailValue label="When">{formatDateTime(log.created_at)}</DetailValue>
            <DetailValue label="IP address">{formatSessionIp(log.ip_address)}</DetailValue>
            <DetailValue label="Device">{simplifyDeviceInfo(log.device_info)}</DetailValue>
          </DetailGrid>
        </Card>

        <Card className="wh-logview-changes">
          <div className="wh-logview-changes__head">
            <h3 className="wh-card__title">What happened</h3>
            <p className="wh-muted">A plain-language summary of this activity.</p>
          </div>
          {summary && <p className="wh-logview-summary">{summary}</p>}
          {changes.length > 0 ? (
            <DiffViewer oldValue={oldValue} newValue={newValue} />
          ) : (
            !summary && <p className="wh-muted">This action didn't record any specific field changes.</p>
          )}
        </Card>
      </FormPageLayout>
    </div>
  );
}
