import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { DiffViewer } from "../../../../components/DiffViewer";
import { TenantSelect } from "../../../../components/TenantSelect";
import { useAuth } from "../../../../context/AuthContext";
import { fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatDateTime } from "../../../../utils/dateTime";

const LOG_TOOLBAR_FILTERS = [{ key: "action", label: "Action" }];

export default function Logs() {
  const { authFetch } = useAuth();
  const [mode, setMode] = useState("wh");
  const [tenantId, setTenantId] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, action: "" });

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
    setExpanded(null);
  }, [mode, tenantId]);

  const expandedRow = rows.find((row) => row.id === expanded);

  const whColumns = [
    { key: "created_at", label: "Time", format: formatDateTime },
    { key: "action", label: "Action" },
    { key: "admin_name", label: "Admin" },
    { key: "ip_address", label: "IP" },
    {
      label: "Details",
      filter: false,
      render: (row) => (
        <button type="button" className="wh-btn wh-btn--secondary wh-btn--sm" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
          {expanded === row.id ? "Hide" : "View diff"}
        </button>
      ),
    },
  ];

  const tenantColumns = [
    { key: "created_at", label: "Time", format: formatDateTime },
    { key: "action", label: "Action" },
    { key: "user_name", label: "User" },
    { key: "module_name", label: "Module" },
    { key: "ip_address", label: "IP" },
    {
      label: "Details",
      filter: false,
      render: (row) => (
        <button type="button" className="wh-btn wh-btn--secondary wh-btn--sm" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
          {expanded === row.id ? "Hide" : "View diff"}
        </button>
      ),
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
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              filters={LOG_TOOLBAR_FILTERS}
              searchPlaceholder="Search logs…"
            />
            <DataTable
              columns={mode === "wh" ? whColumns : tenantColumns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage="No logs for this selection."
            />
            {expandedRow && (
              <div className="wh-card wh-log-diff" style={{ margin: "12px 16px 16px" }}>
                <DiffViewer oldValue={expandedRow.old_value} newValue={expandedRow.new_value} />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
