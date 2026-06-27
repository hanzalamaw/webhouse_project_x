import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../utils/dateTime";

export default function AuditLogs() {
  const { authFetch } = useAuth();
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
    { key: "action", label: "Action" },
    { key: "user_name", label: "User" },
    { key: "module_name", label: "Module" },
    { key: "ip_address", label: "IP", format: (v) => v || "—" },
    { key: "created_at", label: "When", format: formatDateTime },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Audit Logs" description="Tenant activity log. Impersonation actions appear in WebHouse logs only." />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
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
            />
          </>
        )}
      </Card>
    </div>
  );
}
