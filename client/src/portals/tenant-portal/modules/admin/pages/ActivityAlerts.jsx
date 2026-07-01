import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageAlerts } from "../../../../../components/FormPageLayout";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../../utils/sessionDisplay";

const MODULE_BASE = "/app/m/admin";

export default function ActivityAlerts() {
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("admin");
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "created_at" });

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAllTableRows("/tenant/activity-alerts", authFetch);
      setRows(data);
    } catch (err) {
      setError(err.message || "Failed to load alerts");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id, e) => {
    e?.stopPropagation();
    if (!canEdit) return;
    try {
      await apiFetch(`/tenant/activity-alerts/${id}/read`, { method: "PATCH" }, authFetch);
      await load();
    } catch (err) {
      setError(err.message || "Failed to mark alert as read");
    }
  };

  const columns = [
    { key: "title", label: "Title" },
    { key: "alert_type", label: "Type", format: (v) => (v ? String(v).replace(/_/g, " ") : "—") },
    { key: "priority", label: "Priority" },
    { key: "ip_address", label: "IP", format: (v) => formatSessionIp(v) },
    { key: "device_info", label: "Device", format: (v) => simplifyDeviceInfo(v) },
    {
      key: "is_read",
      label: "Status",
      render: (r) => (r.is_read ? <StatusBadge status="inactive" /> : <StatusBadge status="pending" />),
    },
    { key: "created_at", label: "When", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) =>
        !row.is_read ? (
          <Button
            variant="secondary"
            className="wh-btn--sm"
            disabled={!canEdit}
            onClick={(e) => markRead(row.id, e)}
          >
            Mark read
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Activity Alerts"
        description="Important security and configuration events for your organization."
      />
      <FormPageAlerts error={error} />
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              searchPlaceholder="Search alerts…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/activity-alerts/view/${row.id}`)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
