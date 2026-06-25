import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { Button } from "../../../../components/Button";
import { Modal } from "../../../../components/Modal";
import { StatusBadge } from "../../../../components/Badge";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";
import { formatDateTime } from "../../../../utils/dateTime";

const TENANT_TOOLBAR_FILTERS = [
  { key: "status", label: "Status" },
  { key: "plan_name", label: "Plan" },
];

function limitUsage(used, max) {
  if (max == null) return "—";
  return `${used ?? 0}/${max}`;
}

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
  const [toolbar, setToolbar] = useState({
    ...EMPTY_TOOLBAR,
    status: "",
    plan_name: "",
  });

  const filteredRows = useMemo(
    () =>
      applyToolbarFilters(rows, toolbar, {
        dateField: "created_at",
        filters: TENANT_TOOLBAR_FILTERS,
      }),
    [rows, toolbar]
  );

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

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
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "plan_name", label: "Plan", format: (_, r) => r.plan_name || "—" },
    {
      key: "max_users",
      label: "Users",
      filter: false,
      format: (_, r) => limitUsage(r.user_count, r.max_users),
    },
    {
      key: "max_warehouses",
      label: "Warehouses",
      filter: false,
      format: (_, r) => limitUsage(r.warehouse_count, r.max_warehouses),
    },
    {
      key: "max_stores",
      label: "Stores",
      filter: false,
      format: (_, r) => limitUsage(r.store_count, r.max_stores),
    },
    {
      key: "max_orders_per_month",
      label: "Orders / Mo",
      filter: false,
      format: (_, r) => limitUsage(r.orders_this_month, r.max_orders_per_month),
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
              filters={TENANT_TOOLBAR_FILTERS}
              searchPlaceholder="Search tenants…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={!!credentialsRow}
        onClose={closeCredentials}
        title={`Super Admin — ${credentialsRow?.company_name || ""}`}
        footer={
          <Button variant="secondary" onClick={closeCredentials}>Close</Button>
        }
      >
        {credentialsLoading && <p className="wh-muted">Loading…</p>}
        {!credentialsLoading && credentials?.error && (
          <p className="wh-field__error">{credentials.error}</p>
        )}
        {!credentialsLoading && credentials && !credentials.error && (
          <div className="wh-modal__kv">
            <div className="wh-modal__kv-row">
              <span className="wh-modal__kv-label">Name</span>
              <span className="wh-modal__kv-value">{credentials.name}</span>
            </div>
            <div className="wh-modal__kv-row">
              <span className="wh-modal__kv-label">Username</span>
              <span className="wh-modal__kv-value">{credentials.username || credentials.email}</span>
            </div>
            <div className="wh-modal__kv-row">
              <span className="wh-modal__kv-label">Email</span>
              <span className="wh-modal__kv-value">{credentials.email}</span>
            </div>
            <div className="wh-modal__kv-row">
              <span className="wh-modal__kv-label">Password</span>
              <span className="wh-modal__kv-value">
                {showPassword ? credentials.password || "—" : "••••••••"}
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="wh-btn--sm"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Hide password" : "Show password"}
            </Button>
          </div>
        )}
      </Modal>

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
