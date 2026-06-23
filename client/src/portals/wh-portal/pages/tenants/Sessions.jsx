import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { Pagination } from "../../../../components/Pagination";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../api/client";

function isLiveSession(row) {
  return Number(row.is_active) === 1 && !row.logout_at;
}

export default function Sessions() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [terminatingId, setTerminatingId] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/sessions?page=${page}&limit=10&active=true`, {}, authFetch);
      setRows(res.data || []);
      setPagination(res.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.message || "Failed to load sessions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, page]);

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
    { key: "device_info", label: "Device", render: (r) => r.device_info || "—" },
    { key: "login_at", label: "Login At" },
    {
      key: "is_active",
      label: "Status",
      render: (r) => (isLiveSession(r) ? "Live" : "Ended"),
    },
    {
      label: "Actions",
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
      <Card>
        {error && <p className="wh-field__error">{error}</p>}
        {message && <p className="wh-form-message">{message}</p>}
        {loading ? (
          <p className="wh-muted">Loading sessions…</p>
        ) : (
          <>
            <DataTable columns={columns} rows={rows} emptyMessage="No live sessions." />
            <Pagination pagination={pagination} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
