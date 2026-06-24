import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { formatDateTime } from "../../../../utils/dateTime";

export default function ManageTenant() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deleteRow, setDeleteRow] = useState(null);
  const [credentialsRow, setCredentialsRow] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllTableRows("/tenants", authFetch);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const resolveTenantId = (row) => row?.tenant_id ?? row?.id;

  const openEdit = (row) => {
    const tenantId = resolveTenantId(row);
    if (!tenantId) return;
    navigate(`/webhouse-portal/tenants/edit/${tenantId}`);
  };

  const openCredentials = async (row) => {
    const tenantId = resolveTenantId(row);
    if (!tenantId) return;
    setCredentialsRow(row);
    setCredentials(null);
    setShowPassword(false);
    setCredentialsLoading(true);
    try {
      const data = await apiFetch(`/tenants/${tenantId}/credentials`, {}, authFetch);
      setCredentials(data);
    } catch {
      setCredentials({ error: "Could not load credentials." });
    } finally {
      setCredentialsLoading(false);
    }
  };

  const closeCredentials = () => {
    setCredentialsRow(null);
    setCredentials(null);
    setShowPassword(false);
  };

  const columns = [
    { key: "company_name", label: "Company" },
    { key: "owner_name", label: "Owner" },
    { key: "owner_email", label: "Email" },
    { key: "owner_phone", label: "Phone" },
    { key: "industry", label: "Industry" },
    { key: "status", label: "Status" },
    { key: "plan_name", label: "Plan", format: (_, r) => r.plan_name || "—" },
    {
      key: "limits",
      label: "Limits",
      filter: false,
      format: (_, r) =>
        r.max_users != null
          ? `U:${r.max_users} W:${r.max_warehouses} S:${r.max_stores} O:${r.max_orders_per_month}`
          : "—",
    },
    { key: "created_at", label: "Created", format: formatDateTime },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <div className="wh-action-btns">
          <Button variant="secondary" className="wh-btn--sm" onClick={() => openCredentials(row)}>Password</Button>
          <Button variant="secondary" className="wh-btn--sm" onClick={() => openEdit(row)}>Edit</Button>
          <Button variant="danger" className="wh-btn--sm" onClick={() => setDeleteRow(row)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader title="Manage Tenant" description="Tenant directory and super-admin credentials." />
      <Card>
        {loading ? (
          <p className="wh-muted">Loading…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            filterRows={rows}
            page={page}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </Card>

      {credentialsRow && (
        <div className="wh-modal-overlay" onClick={closeCredentials}>
          <div className="wh-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="wh-modal__title">Super Admin — {credentialsRow.company_name}</h3>
            {credentialsLoading && <p className="wh-muted">Loading…</p>}
            {!credentialsLoading && credentials?.error && (
              <p className="wh-field__error">{credentials.error}</p>
            )}
            {!credentialsLoading && credentials && !credentials.error && (
              <div className="wh-review-block__body">
                <p><strong>Name:</strong> {credentials.name}</p>
                <p><strong>Username:</strong> {credentials.username || credentials.email}</p>
                <p><strong>Email:</strong> {credentials.email}</p>
                <p>
                  <strong>Password:</strong>{" "}
                  {showPassword ? credentials.password || "—" : "••••••••"}
                  <Button
                    type="button"
                    variant="secondary"
                    className="wh-btn--sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </Button>
                </p>
              </div>
            )}
            <div className="wh-modal__actions">
              <Button variant="secondary" onClick={closeCredentials}>Close</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deleteRow}
        onClose={() => {
          setDeleteRow(null);
          setDeleteError("");
        }}
        error={deleteError}
        onConfirm={async () => {
          const tenantId = resolveTenantId(deleteRow);
          if (!tenantId) {
            setDeleteError("Invalid tenant id.");
            return;
          }
          setDeleting(true);
          setDeleteError("");
          try {
            await apiFetch(`/tenants/${tenantId}`, { method: "DELETE" }, authFetch);
            setDeleteRow(null);
            await load();
          } catch (err) {
            setDeleteError(err.message || "Delete failed.");
          } finally {
            setDeleting(false);
          }
        }}
        recordName={deleteRow?.company_name}
        loading={deleting}
      />
    </div>
  );
}
