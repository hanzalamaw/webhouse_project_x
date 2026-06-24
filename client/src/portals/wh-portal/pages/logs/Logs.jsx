import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { DiffViewer } from "../../../../components/DiffViewer";
import { FormField } from "../../../../components/FormField";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { formatDateTime } from "../../../../utils/dateTime";

export default function Logs() {
  const { authFetch } = useAuth();
  const [mode, setMode] = useState("wh");
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    apiFetch("/tenants?page=1&limit=200", {}, authFetch)
      .then((r) => setTenants(r.data || []))
      .catch(() => {});
  }, [authFetch]);

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
          <FormField
            id="tenant_log_pick"
            label="Select Tenant"
            as="select"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            <option value="">Choose a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.company_name}</option>
            ))}
          </FormField>
        </Card>
      )}
      <Card>
        {mode === "tenant" && !tenantId ? (
          <p className="wh-muted">Select a tenant to view their activity logs.</p>
        ) : loading ? (
          <p className="wh-muted">Loading logs…</p>
        ) : (
          <>
            <DataTable
              columns={mode === "wh" ? whColumns : tenantColumns}
              rows={rows}
              filterRows={rows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage="No logs for this selection."
            />
            {rows.map((row) =>
              expanded === row.id ? (
                <div key={`exp-${row.id}`} className="wh-card" style={{ marginTop: 12 }}>
                  <DiffViewer oldValue={row.old_value} newValue={row.new_value} />
                </div>
              ) : null
            )}
          </>
        )}
      </Card>
    </div>
  );
}
