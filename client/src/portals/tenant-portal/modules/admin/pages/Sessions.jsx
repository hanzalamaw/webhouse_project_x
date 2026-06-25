import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { Button } from "../../../../../components/Button";
import { Badge } from "../../../../../components/Badge";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { formatDateTime } from "../../../../../utils/dateTime";

function isLiveSession(row) {
  return Number(row.is_active) === 1 && !row.logout_at;
}

export default function Sessions() {
  const { authFetch } = useAuth();
  const { canDelete, canView, readOnly } = useModulePermission("admin");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [terminatingId, setTerminatingId] = useState(null);
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "login_at" }),
    [rows, toolbar]
  );

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAllTableRows("/tenant/sessions", authFetch);
      setRows(data);
    } catch (err) {
      setError(err.message || "Failed to load sessions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const terminate = async (id) => {
    setTerminatingId(id);
    setMessage("");
    setError("");
    try {
      await apiFetch(`/tenant/sessions/${id}/terminate`, { method: "POST" }, authFetch);
      setMessage("Session terminated.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to terminate session");
    } finally {
      setTerminatingId(null);
    }
  };

  const columns = [
    { key: "user_name", label: "User" },
    { key: "user_email", label: "Email" },
    { key: "ip_address", label: "IP" },
    { key: "device_info", label: "Device", format: (v) => v || "—" },
    { key: "login_at", label: "Login At", format: formatDateTime },
    {
      key: "is_active",
      label: "Status",
      render: (r) =>
        isLiveSession(r) ? <Badge tone="success">Live</Badge> : <Badge tone="neutral">Ended</Badge>,
    },
    {
      label: "Actions",
      filter: false,
      render: (row) =>
        isLiveSession(row) && canDelete ? (
          <Button
            variant="danger"
            className="wh-btn--sm"
            disabled={terminatingId === row.id}
            onClick={() => terminate(row.id)}
          >
            {terminatingId === row.id ? "…" : "Terminate"}
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Sessions" description="Active and recent sessions for your organization." />
      {readOnly && canView && (
        <p className="wh-muted" style={{ marginBottom: 12 }}>
          View-only access — you cannot terminate sessions.
        </p>
      )}
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}
      <Card className="wh-card--table">
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="login_at"
              searchPlaceholder="Search sessions…"
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
