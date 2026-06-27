import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { Modal } from "../../../../../components/Modal";
import { SearchableSelect } from "../../../../../components/SearchableSelect";
import { StatusBadge } from "../../../../../components/Badge";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatDateTime } from "../../../../../utils/dateTime";

const STATUS_OPTIONS = ["active", "inactive"];
const SUPER_ADMIN_ROLE_NAME = "Super Admin";
const EMPTY_FORM = {
  name: "",
  email: "",
  username: "",
  phone: "",
  role_id: "",
  status: "active",
  password: "",
};

export default function UserManagement() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("admin");
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [limits, setLimits] = useState({ max_users: 0, active_count: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editingSuperAdmin, setEditingSuperAdmin] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const filteredRows = useToolbarFilteredRows(rows, toolbar, { dateField: "last_login_at" });

  const assignableRoleOptions = useMemo(
    () =>
      roles
        .filter((r) => r.role_name !== SUPER_ADMIN_ROLE_NAME)
        .map((r) => ({
          value: String(r.id),
          label: r.role_name,
        })),
    [roles]
  );

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/tenant/users", {}, authFetch);
      setRows(res.data || []);
      setLimits(res.limits || { max_users: 0, active_count: 0 });
      const roleRes = await apiFetch("/tenant/roles", {}, authFetch);
      setRoles(roleRes.data || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    if (!canCreate) return;
    setEditId(null);
    setEditingSuperAdmin(false);
    const defaultRole = roles.find((r) => r.role_name !== SUPER_ADMIN_ROLE_NAME);
    setForm({ ...EMPTY_FORM, role_id: defaultRole?.id ? String(defaultRole.id) : "" });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    if (!canEdit) return;
    setEditId(row.id);
    setEditingSuperAdmin(row.role_name === SUPER_ADMIN_ROLE_NAME);
    setForm({
      name: row.name || "",
      email: row.email || "",
      username: row.username || "",
      phone: row.phone || "",
      role_id: row.role_id ? String(row.role_id) : "",
      status: row.status || "active",
      password: "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        phone: form.phone.trim() || null,
        role_id: Number(form.role_id),
        status: form.status,
      };
      if (form.password) payload.password = form.password;
      if (editId) {
        await apiFetch(`/tenant/users/${editId}`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
        setMessage("User updated.");
      } else {
        if (!form.password || form.password.length < 6) {
          setError("Password is required (min 6 characters).");
          return;
        }
        payload.password = form.password;
        await apiFetch("/tenant/users", { method: "POST", body: JSON.stringify(payload) }, authFetch);
        setMessage("User created.");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "name", label: "Name" },
    { key: "username", label: "Username" },
    { key: "email", label: "Email" },
    { key: "role_name", label: "Role" },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    { key: "last_login_at", label: "Last Login", format: (v) => (v ? formatDateTime(v) : "—") },
    {
      label: "Actions",
      filter: false,
      render: (row) => (
        <Button
          variant="secondary"
          className="wh-btn--sm"
          disabled={!canEdit}
          onClick={() => openEdit(row)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="User Management"
        description={`Active users: ${limits.active_count}/${limits.max_users}. Users can be set active or inactive — no delete.`}
        actions={
          <Button
            onClick={openCreate}
            disabled={!canCreate || limits.active_count >= limits.max_users}
          >
            Add User
          </Button>
        }
      />
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
              dateField="last_login_at"
              searchPlaceholder="Search users…"
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit User" : "Create User"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || (editId ? !canEdit : !canCreate)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="wh-form-grid wh-form-grid--modal">
          <FormField id="name" label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <FormField id="email" label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          <FormField id="username" label="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <FormField id="phone" label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          {editingSuperAdmin ? (
            <FormField
              id="role_id"
              label="Role"
              value={SUPER_ADMIN_ROLE_NAME}
              readOnly
              disabled
            />
          ) : (
            <SearchableSelect
              id="role_id"
              label="Role"
              value={form.role_id}
              onChange={(v) => setForm((f) => ({ ...f, role_id: v }))}
              options={assignableRoleOptions}
              placeholder="Search roles…"
              emptyMessage="No roles found"
            />
          )}
          {editingSuperAdmin && (
            <p className="wh-muted wh-form-grid__full">Super Admin role cannot be changed.</p>
          )}
          <FormField
            id="status"
            label="Status"
            as="select"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </FormField>
          <FormField
            id="password"
            label={editId ? "New Password (optional)" : "Password"}
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
