import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageAlerts } from "../../../../../components/FormPageLayout";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { useAuth } from "../../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../../utils/sessionDisplay";
import { formatTenantAuditAction } from "../../../../../utils/auditActionLabels";

const MODULE_BASE = "/app/m/admin";

export default function AuditLogs() {
  const { authFetch } = useAuth();
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
      const data = await fetchAllTableRows("/tenant/audit-logs", authFetch);
      setRows(data);
    } catch (err) {
      setError(err.message || "Failed to load audit logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "action",
      label: "Action",
      format: (v) => formatTenantAuditAction(v),
    },
    { key: "user_name", label: "User" },
    { key: "module_name", label: "Module" },
    { key: "ip_address", label: "IP", format: (v) => formatSessionIp(v) },
    { key: "device_info", label: "Device", format: (v) => simplifyDeviceInfo(v) },
    { key: "created_at", label: "When", format: formatDateTime },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Audit Logs" description="Tenant activity log. Impersonation actions appear in WebHouse logs only." />
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
              searchPlaceholder="Search audit logs…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/audit-logs/view/${row.id}`)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
