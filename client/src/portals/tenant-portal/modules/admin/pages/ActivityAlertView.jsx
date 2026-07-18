import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";
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

function parseMeta(alert) {
  if (alert?.meta && typeof alert.meta === "object") return alert.meta;
  if (!alert?.meta_json) return null;
  try {
    return typeof alert.meta_json === "string" ? JSON.parse(alert.meta_json) : alert.meta_json;
  } catch {
    return null;
  }
}

export default function ActivityAlertView() {
  const { alertId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      try {
        const data = await apiFetch(`/tenant/activity-alerts/${alertId}`, {}, authFetch);
        setAlert(data?.data || data);
        return;
      } catch {
        // Fallback if single-get is unavailable
      }
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

  const meta = parseMeta(alert);
  const isDuplicate = alert?.alert_type === "ecom_duplicate" && meta?.kind === "ecom_duplicate";
  const platformLabel = meta?.platform === "daraz" ? "Daraz" : "Shopify";

  const resolveDuplicate = async (action) => {
    setResolving(true);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch(
        `/tenant/activity-alerts/${alertId}/resolve-duplicate`,
        { method: "POST", body: JSON.stringify({ action }) },
        authFetch,
      );
      setMessage(
        action === "update"
          ? `Kept ${platformLabel} data and linked the ERP record.`
          : "Kept ERP data and linked the store record.",
      );
      setAlert((prev) => (prev ? { ...prev, is_read: 1 } : prev));
      if (result?.ok === false) throw new Error(result.message || "Resolve failed");
    } catch (e) {
      setError(e.message || "Could not apply your choice");
    } finally {
      setResolving(false);
    }
  };

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
          description={isDuplicate ? "Choose which side’s data to keep for this sync duplicate." : "Security or configuration event details."}
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

        {error && <div className="wh-alert wh-alert--error">{error}</div>}
        {message && <div className="wh-alert wh-alert--success">{message}</div>}

        {isDuplicate && !alert.is_read ? (
          <Card>
            <h3 className="wh-card__title">Duplicate sync — pick a side</h3>
            <p className="wh-muted" style={{ marginBottom: "1rem" }}>
              {meta.entityType || "record"} “{meta.name || meta.sku || meta.externalId}” exists in ERP and on{" "}
              {platformLabel}. Click which data to keep.
            </p>
            <div className="wh-tx-payments-wrap" style={{ marginBottom: "1rem" }}>
              <table className="wh-tx-payments-table">
                <thead>
                  <tr>
                    <th>ERP</th>
                    <th>{platformLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div>{meta.name || "Existing ERP record"}</div>
                      {meta.existingId ? (
                        <div className="wh-muted" style={{ fontSize: "0.85rem" }}>ERP id {meta.existingId}</div>
                      ) : null}
                      {meta.sku ? (
                        <div className="wh-muted" style={{ fontSize: "0.85rem" }}>SKU {meta.sku}</div>
                      ) : null}
                    </td>
                    <td>
                      <div>{meta.name || meta.externalId || "Store record"}</div>
                      <div className="wh-muted" style={{ fontSize: "0.85rem" }}>
                        {platformLabel} id {meta.externalId}
                      </div>
                      {meta.sku ? (
                        <div className="wh-muted" style={{ fontSize: "0.85rem" }}>SKU {meta.sku}</div>
                      ) : null}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="wh-action-btns" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                disabled={resolving}
                onClick={() => resolveDuplicate("rely")}
              >
                Keep ERP
              </Button>
              <Button
                disabled={resolving}
                onClick={() => resolveDuplicate("update")}
              >
                Keep {platformLabel}
              </Button>
            </div>
          </Card>
        ) : null}

        {isDuplicate && alert.is_read ? (
          <Card>
            <p className="wh-muted" style={{ margin: 0 }}>
              This duplicate was already resolved.
            </p>
          </Card>
        ) : null}

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
