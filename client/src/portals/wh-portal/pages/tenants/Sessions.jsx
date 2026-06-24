import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { Button } from "../../../../components/Button";
import { Badge } from "../../../../components/Badge";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatDateTime } from "../../../../utils/dateTime";

function isLiveSession(row) {
  return Number(row.is_active) === 1 && !row.logout_at;
}

export default function Sessions() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [terminatingId, setTerminatingId] = useState(null);
  const [message, setMessage] = useState("");
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
      const data = await fetchAllTableRows("/sessions?active=true", authFetch);
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
    setMessage("");
    setError("");
    setTerminatingId(id);
    try {
      await apiFetch(`/sessions/${id}/terminate`, { method: "POST" }, authFetch);
      setMessage("Session terminated.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to terminate session");
    } finally {
      setTerminatingId(null);
    }
  };

  const columns = [
    { key: "company_name", label: "Tenant" },
    { key: "user_name", label: "User" },
    { key: "user_email", label: "Email" },
    { key: "ip_address", label: "IP" },
    { key: "device_info", label: "Device", format: (v) => v || "—" },
    { key: "login_at", label: "Login At", format: formatDateTime },
    {
      key: "is_active",
      label: "Status",
      format: (_, r) => (isLiveSession(r) ? "Live" : "Ended"),
      render: (r) =>
        isLiveSession(r) ? <Badge tone="success">Live</Badge> : <Badge tone="neutral">Ended</Badge>,
    },
    {
      label: "Actions",
      filter: false,
      render: (row) =>
        isLiveSession(row) ? (
          <Button
            variant="danger"
            className="wh-btn--sm"
            disabled={terminatingId === row.id}
            onClick={() => terminate(row.id)}
          >
            {terminatingId === row.id ? "Terminating…" : "Terminate"}
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Tenant Sessions"
        description="Live tenant sessions. Terminating ends the session and logs the user out on their next request."
      />
      <Card className="wh-card--table">
        {error && <p className="wh-field__error">{error}</p>}
        {message && <p className="wh-form-message">{message}</p>}
        {loading ? (
          <p className="wh-muted">Loading sessions…</p>
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
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              emptyMessage="No live sessions."
            />
          </>
        )}
      </Card>
    </div>
  );
}
