import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../api/client";

const ACTIONS = ["view", "create", "edit", "delete", "export"];
const SUPER_ADMIN_ROLE_NAME = "Super Admin";

function applyImpliedPermissions(matrix) {
  const next = { ...matrix };
  for (const [moduleId, actions] of Object.entries(next)) {
    const set = new Set(actions);
    if (set.has("delete") || set.has("edit") || set.has("create") || set.has("export")) {
      set.add("view");
    }
    next[moduleId] = ACTIONS.filter((a) => set.has(a));
  }
  return next;
}

function moduleHasAll(perms) {
  return ACTIONS.every((a) => perms.has(a));
}

export default function RolesAndPermissions() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("admin");
  const [roles, setRoles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/tenant/roles", {}, authFetch);
      setRoles(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const loadRole = useCallback(
    async (id) => {
      try {
        const res = await apiFetch(`/tenant/roles/${id}`, {}, authFetch);
        setDetail(res.data);
        setSelectedId(id);
      } catch (err) {
        setError(err.message || "Failed to load role");
      }
    },
    [authFetch]
  );

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (roles.length && !selectedId) {
      loadRole(roles[0].id);
    }
  }, [roles, selectedId, loadRole]);

  const togglePermission = (moduleId, action) => {
    if (!detail || isSuperAdminRole || !canEdit) return;
    const key = String(moduleId);
    const current = new Set(detail.permissions?.[key] || []);
    if (current.has(action)) current.delete(action);
    else current.add(action);
    const updated = applyImpliedPermissions({
      ...detail.permissions,
      [key]: ACTIONS.filter((a) => current.has(a)),
    });
    setDetail({ ...detail, permissions: updated });
  };

  const setModulePermissions = (moduleId, actions) => {
    if (!detail || isSuperAdminRole || !canEdit) return;
    const key = String(moduleId);
    const updated = applyImpliedPermissions({
      ...detail.permissions,
      [key]: [...actions],
    });
    setDetail({ ...detail, permissions: updated });
  };

  const toggleAllForModule = (moduleId) => {
    const key = String(moduleId);
    const perms = new Set(detail.permissions?.[key] || []);
    if (moduleHasAll(perms)) {
      setModulePermissions(moduleId, []);
    } else {
      setModulePermissions(moduleId, ACTIONS);
    }
  };

  const saveRole = async () => {
    if (!detail) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiFetch(
        `/tenant/roles/${detail.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            role_name: detail.role_name,
            description: detail.description,
            status: detail.status,
            permissions: detail.permissions,
          }),
        },
        authFetch
      );
      setMessage("Role saved.");
      await loadRoles();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!canCreate) return;
    if (!newRoleName.trim()) return;
    if (newRoleName.trim() === SUPER_ADMIN_ROLE_NAME) {
      setError("Super Admin is a reserved role name");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await apiFetch(
        "/tenant/roles",
        {
          method: "POST",
          body: JSON.stringify({ role_name: newRoleName.trim(), permissions: {} }),
        },
        authFetch
      );
      setNewRoleName("");
      await loadRoles();
      if (res.data?.id) await loadRole(res.data.id);
    } catch (err) {
      setError(err.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const modules = detail?.assignable_modules || [];
  const isSuperAdminRole = detail?.role_name === SUPER_ADMIN_ROLE_NAME;

  return (
    <div className="wh-page">
      <PageHeader
        title="Roles & Permissions"
        description="Create roles, edit role details, and assign module permissions in one place."
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}

      <div className="wh-split-layout">
        <Card className="wh-split-layout__side">
          <h3 className="wh-card__title">Roles</h3>
          {loading ? (
            <p className="wh-muted">Loading…</p>
          ) : (
            <ul className="wh-role-list">
              {roles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`wh-role-list__btn${selectedId === r.id ? " active" : ""}`}
                    onClick={() => loadRole(r.id)}
                  >
                    <span>{r.role_name}</span>
                    <span className="wh-muted">{r.user_count} users</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="wh-role-create">
            <FormField
              id="newRole"
              label="New role name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              disabled={!canCreate}
            />
            <Button
              onClick={createRole}
              disabled={!canCreate || creating || !newRoleName.trim()}
            >
              {creating ? "Creating…" : "Create Role"}
            </Button>
          </div>
        </Card>

        <Card className="wh-split-layout__main">
          {!detail ? (
            <p className="wh-muted">Select a role.</p>
          ) : (
            <>
              {isSuperAdminRole ? (
                <>
                  <h3>{detail.role_name}</h3>
                  <p className="wh-muted">{detail.description || "No description"}</p>
                  <p className="wh-muted">
                    Super Admin has full access; the role name and permissions cannot be edited.
                  </p>
                </>
              ) : (
                <div className="wh-form-grid wh-form-grid--modal" style={{ marginBottom: 16 }}>
                  <FormField
                    id="role_name"
                    label="Role name"
                    value={detail.role_name}
                    onChange={(e) => setDetail({ ...detail, role_name: e.target.value })}
                    disabled={!canEdit}
                  />
                  <FormField
                    id="description"
                    label="Description"
                    value={detail.description || ""}
                    onChange={(e) => setDetail({ ...detail, description: e.target.value })}
                    disabled={!canEdit}
                  />
                  <FormField
                    id="status"
                    label="Status"
                    as="select"
                    value={detail.status || "active"}
                    onChange={(e) => setDetail({ ...detail, status: e.target.value })}
                    disabled={!canEdit}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </FormField>
                </div>
              )}

              <h4 className="wh-card__title" style={{ marginBottom: 12 }}>
                Module permissions
              </h4>
              <div className="wh-perm-matrix-wrap">
                <table className="wh-perm-matrix">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>All</th>
                      {ACTIONS.map((a) => (
                        <th key={a}>{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => {
                      const perms = new Set(detail.permissions?.[String(mod.id)] || []);
                      const allOn = moduleHasAll(perms);
                      return (
                        <tr key={mod.id}>
                          <td>{mod.module_name}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={allOn}
                              disabled={isSuperAdminRole || !canEdit}
                              onChange={() => toggleAllForModule(mod.id)}
                              aria-label={`All permissions for ${mod.module_name}`}
                            />
                          </td>
                          {ACTIONS.map((action) => (
                            <td key={action}>
                              <input
                                type="checkbox"
                                checked={allOn || perms.has(action)}
                                disabled={isSuperAdminRole || !canEdit || allOn}
                                onChange={() => togglePermission(mod.id, action)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!isSuperAdminRole && (
                <div className="wh-form-grid__actions" style={{ marginTop: 16 }}>
                  <Button onClick={saveRole} disabled={!canEdit || saving}>
                    {saving ? "Saving…" : "Save role & permissions"}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
