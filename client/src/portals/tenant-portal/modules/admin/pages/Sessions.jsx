import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageAlerts } from "../../../../../components/FormPageLayout";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { Button } from "../../../../../components/Button";
import { Badge } from "../../../../../components/Badge";
import { ConfirmActionModal } from "../../../../../components/ConfirmActionModal";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../utils/dateTime";
import { formatSessionIp, simplifyDeviceInfo } from "../../../../../utils/sessionDisplay";

function isLiveSession(row) {
  return Number(row.is_active) === 1 && !row.logout_at;
}

export default function Sessions() {
  const { authFetch } = useAuth();
  const { canEdit, canDelete } = useModulePermission("admin");
  const canTerminate = canEdit || canDelete;
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [terminatingId, setTerminatingId] = useState(null);
  const [terminateTarget, setTerminateTarget] = useState(null);
  const [terminateError, setTerminateError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "login_at" });

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
    if (!canTerminate) return;
    setTerminatingId(id);
    setMessage("");
    setError("");
    setTerminateError("");
    try {
      await apiFetch(`/tenant/sessions/${id}/terminate`, { method: "POST" }, authFetch);
      setMessage("Session terminated.");
      setTerminateTarget(null);
      await load();
    } catch (err) {
      setTerminateError(err.message || "Failed to terminate session");
    } finally {
      setTerminatingId(null);
    }
  };

  const columns = [
    { key: "user_name", label: "User" },
    { key: "user_email", label: "Email" },
    { key: "ip_address", label: "IP", format: (v) => formatSessionIp(v) },
    { key: "device_info", label: "Device", format: (v) => simplifyDeviceInfo(v) },
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
        isLiveSession(row) ? (
          <Button
            variant="danger"
            className="wh-btn--sm"
            disabled={!canTerminate || terminatingId === row.id}
            onClick={() => setTerminateTarget(row)}
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
      <FormPageAlerts error={error} message={message} />
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

      <ConfirmActionModal
        open={Boolean(terminateTarget)}
        onClose={() => {
          if (terminatingId) return;
          setTerminateTarget(null);
          setTerminateError("");
        }}
        onConfirm={() => terminate(terminateTarget.id)}
        title="End this session?"
        message={
          terminateTarget
            ? `Are you sure you want to end the session for ${terminateTarget.user_name || "this user"}? They will be signed out immediately.`
            : ""
        }
        confirmLabel="End session"
        loading={Boolean(terminatingId)}
        error={terminateError}
      />
    </div>
  );
}
