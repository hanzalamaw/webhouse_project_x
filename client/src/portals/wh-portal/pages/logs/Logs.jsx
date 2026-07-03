import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { TenantSelect } from "../../../../components/TenantSelect";
import { useAuth } from "../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatDateTime } from "../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../utils/sessionDisplay";
import { formatWhAuditAction, formatTenantAuditAction } from "../../../../utils/auditActionLabels";

const LOG_TOOLBAR_FILTERS = [{ key: "action", label: "Action" }];

export default function Logs() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("wh");
  const [tenantId, setTenantId] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, action: "" });

  const openLog = useCallback(
    (row) => {
      const params = new URLSearchParams({ source: mode });
      if (mode === "tenant" && tenantId) params.set("tenant_id", String(tenantId));
      navigate(`/webhouse-portal/logs/view/${row.id}?${params.toString()}`);
    },
    [navigate, mode, tenantId]
  );

  const filteredRows = useMemo(
    () =>
      applyToolbarFilters(rows, toolbar, {
        dateField: "created_at",
        filters: LOG_TOOLBAR_FILTERS,
      }),
    [rows, toolbar]
  );

  useEffect(() => {
    setPage(1);
  }, [toolbar, mode, tenantId]);

  const load = useCallback(async () => {
    if (mode === "tenant" && !tenantId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const path =
        mode === "wh"
          ? "/logs/wh"
          : `/logs/tenant?tenant_id=${tenantId}`;
      const data = await fetchAllTableRows(path, authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, mode, tenantId]);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [mode, tenantId]);

  const whColumns = [
    { key: "created_at", label: "Time", format: formatDateTime },
    {
      key: "action",
      label: "What happened",
      format: (v) => formatWhAuditAction(v),
    },
    { key: "admin_name", label: "Admin" },
    {
      key: "ip_address",
      label: "IP",
      format: (v) => formatSessionIp(v),
    },
  ];

  const tenantColumns = [
    { key: "created_at", label: "Time", format: formatDateTime },
    {
      key: "action",
      label: "What happened",
      format: (v) => formatTenantAuditAction(v),
    },
    { key: "user_name", label: "User" },
    { key: "module_name", label: "Module" },
    {
      key: "ip_address",
      label: "IP",
      format: (v) => formatSessionIp(v),
    },
    {
      key: "device_info",
      label: "Device",
      format: (v) => simplifyDeviceInfo(v),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Logs" description="Webhouse admin audit logs and per-tenant activity logs." />
      <div className="wh-log-toggle">
        <button type="button" className={mode === "wh" ? "active" : ""} onClick={() => setMode("wh")}>
          WH Audit Logs
        </button>
        <button type="button" className={mode === "tenant" ? "active" : ""} onClick={() => setMode("tenant")}>
          Tenant Logs
        </button>
      </div>
      {mode === "tenant" && (
        <Card style={{ marginBottom: 16 }}>
          <TenantSelect
            id="tenant_log_pick"
            label="Select Tenant"
            value={tenantId}
            onChange={setTenantId}
          />
        </Card>
      )}
      <Card className="wh-card--table">
        {mode === "tenant" && !tenantId ? (
          <p className="wh-muted">Select a tenant to view their activity logs.</p>
        ) : loading ? (
          <p className="wh-muted">Loading logs…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows.map((r) => ({
                ...r,
                action: mode === "wh" ? formatWhAuditAction(r.action) : formatTenantAuditAction(r.action),
              }))}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              filters={LOG_TOOLBAR_FILTERS}
              searchPlaceholder="Search logs…"
              layout="stacked"
            />
            <DataTable
              columns={mode === "wh" ? whColumns : tenantColumns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={openLog}
              emptyMessage="No logs for this selection."
            />
          </>
        )}
      </Card>
    </div>
  );
}
