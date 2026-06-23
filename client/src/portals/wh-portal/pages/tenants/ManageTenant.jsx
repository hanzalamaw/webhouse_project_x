import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { Pagination } from "../../../../components/Pagination";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, TENANT_STATUS } from "../../../../api/client";

export default function ManageTenant() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [credentialsRow, setCredentialsRow] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({});
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    const res = await apiFetch(`/tenants?page=${page}&limit=10`, {}, authFetch);
    setRows(res.data);
    setPagination(res.pagination);
  }, [authFetch, page]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      company_name: row.company_name,
      owner_name: row.owner_name,
      owner_email: row.owner_email,
      owner_phone: row.owner_phone,
      industry: row.industry,
      status: row.status,
    });
  };

  const resolveTenantId = (row) => row?.tenant_id ?? row?.id;

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

  const saveEdit = async () => {
    const tenantId = resolveTenantId(editRow);
    if (!tenantId) return;
    await apiFetch(`/tenants/${tenantId}`, { method: "PUT", body: JSON.stringify(form) }, authFetch);
    setEditRow(null);
    load();
  };

  const columns = [
    { key: "company_name", label: "Company" },
    { key: "owner_name", label: "Owner" },
    { key: "owner_email", label: "Email" },
    { key: "owner_phone", label: "Phone" },
    { key: "industry", label: "Industry" },
    { key: "status", label: "Status" },
    { key: "plan_name", label: "Plan", render: (r) => r.plan_name || "—" },
    {
      key: "limits",
      label: "Limits",
      render: (r) =>
        r.max_users != null
          ? `U:${r.max_users} W:${r.max_warehouses} S:${r.max_stores} O:${r.max_orders_per_month}`
          : "—",
    },
    { key: "created_at", label: "Created" },
    {
      label: "Actions",
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
        <DataTable columns={columns} rows={rows} />
        <Pagination pagination={pagination} onPageChange={setPage} />
      </Card>

      {editRow && (
        <div className="wh-modal-overlay" onClick={() => setEditRow(null)}>
          <div className="wh-modal wh-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="wh-modal__title">Edit Tenant</h3>
            <div className="wh-form-grid">
              <FormField id="cn" label="Company" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
              <FormField id="on" label="Owner" value={form.owner_name} onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))} />
              <FormField id="oe" label="Email" value={form.owner_email} onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))} />
              <FormField id="op" label="Phone" value={form.owner_phone} onChange={(e) => setForm((f) => ({ ...f, owner_phone: e.target.value }))} />
              <FormField id="ind" label="Industry" value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
              <FormField id="st" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {TENANT_STATUS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </FormField>
            </div>
            <div className="wh-modal__actions">
              <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </div>
        </div>
      )}

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
