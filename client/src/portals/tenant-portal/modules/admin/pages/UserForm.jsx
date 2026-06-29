import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { FormBlock } from "../../../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../components/FormPageLayout";
import { SearchableSelect } from "../../../../../components/SearchableSelect";
import { AccountDetailsModal } from "../../../../../components/AccountDetailsModal";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { useUnsavedChangesGuard } from "../../../../../hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "../../../../../components/UnsavedChangesDialog";
import { apiFetch, loginPortalUrl } from "../../../../../api/client";
import { buildUserLoginSections } from "../../../../../utils/accountDetails";

const MODULE_BASE = "/app/m/admin";
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

function ReviewRow({ label, value }) {
  return (
    <div className="wh-review-row">
      <span className="wh-review-row__label">{label}</span>
      <span className="wh-review-row__value">{value ?? "—"}</span>
    </div>
  );
}

function serializeForm(form) {
  return JSON.stringify(form);
}

export default function UserForm() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const isEdit = Boolean(userId);
  const { authFetch, user: authUser } = useAuth();
  const { canCreate, canEdit } = useModulePermission("admin");

  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState("form");
  const [editingSuperAdmin, setEditingSuperAdmin] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSections, setDetailsSections] = useState([]);
  const [detailsTitle, setDetailsTitle] = useState("");

  const loginLink = loginPortalUrl(authUser?.login_portal || "erp1");

  const assignableRoleOptions = useMemo(
    () =>
      roles
        .filter((r) => r.role_name !== SUPER_ADMIN_ROLE_NAME)
        .map((r) => ({ value: String(r.id), label: r.role_name })),
    [roles]
  );

  const selectedRoleName = useMemo(() => {
    if (editingSuperAdmin) return SUPER_ADMIN_ROLE_NAME;
    return roles.find((r) => String(r.id) === String(form.role_id))?.role_name || "—";
  }, [editingSuperAdmin, form.role_id, roles]);

  const isDirty = useMemo(() => {
    if (isEdit) return baseline !== null && serializeForm(form) !== baseline;
    return serializeForm(form) !== serializeForm(EMPTY_FORM);
  }, [baseline, form, isEdit]);

  const { dialogOpen, stayOnPage, leavePage } = useUnsavedChangesGuard(isDirty, { enabled: isEdit || isDirty });

  useEffect(() => {
    apiFetch("/tenant/roles", {}, authFetch)
      .then((res) => setRoles(res.data || []))
      .catch(() => setRoles([]));
  }, [authFetch]);

  useEffect(() => {
    if (isEdit) return;
    const defaultRole = roles.find((r) => r.role_name !== SUPER_ADMIN_ROLE_NAME);
    if (defaultRole && !form.role_id) {
      setForm((f) => ({ ...f, role_id: String(defaultRole.id) }));
    }
  }, [isEdit, roles, form.role_id]);

  useEffect(() => {
    if (!isEdit) return undefined;
    let active = true;
    setLoading(true);
    apiFetch("/tenant/users", {}, authFetch)
      .then((res) => {
        if (!active) return;
        const row = (res.data || []).find((u) => String(u.id) === String(userId));
        if (!row) throw new Error("User not found");
        const next = {
          name: row.name || "",
          email: row.email || "",
          username: row.username || "",
          phone: row.phone || "",
          role_id: row.role_id ? String(row.role_id) : "",
          status: row.status || "active",
          password: "",
        };
        setEditingSuperAdmin(row.role_name === SUPER_ADMIN_ROLE_NAME);
        setForm(next);
        setBaseline(serializeForm(next));
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load user");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isEdit, userId, authFetch]);

  const goBack = useCallback(() => {
    navigate(`${MODULE_BASE}/user-management`);
  }, [navigate]);

  const validateForm = () => {
    if (!form.name.trim()) return "Name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.username.trim()) return "Username is required.";
    if (!form.role_id && !editingSuperAdmin) return "Role is required.";
    if (!isEdit && (!form.password || form.password.length < 6)) {
      return "Please enter a password with at least 6 characters.";
    }
    if (isEdit && form.password && form.password.length < 6) {
      return "Password must be at least 6 characters if changing.";
    }
    return null;
  };

  const goToReview = () => {
    const err = validateForm();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setPhase("review");
  };

  const save = async () => {
    const err = validateForm();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError("");
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

      if (isEdit) {
        await apiFetch(`/tenant/users/${userId}`, { method: "PUT", body: JSON.stringify(payload) }, authFetch);
        setBaseline(serializeForm({ ...form, password: "" }));
        navigate(`${MODULE_BASE}/user-management`);
        return;
      }

      payload.password = form.password;
      const res = await apiFetch("/tenant/users", { method: "POST", body: JSON.stringify(payload) }, authFetch);
      const created = res.data;
      setDetailsTitle(`Sign-in details — ${created?.name || form.name.trim()}`);
      setDetailsSections(
        buildUserLoginSections({
          loginLink,
          username: created?.username || form.username.trim(),
          password: form.password,
          name: created?.name || form.name.trim(),
          email: created?.email || form.email.trim(),
          roleName: created?.role_name,
        })
      );
      setDetailsOpen(true);
      setForm(EMPTY_FORM);
      setPhase("form");
    } catch (err) {
      setError(err.message || "Could not save this user. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <p className="wh-muted">Loading user…</p>
        </FormPageLayout>
      </div>
    );
  }

  const canSave = isEdit ? canEdit : canCreate;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit User" : "Create User"}
          description={
            isEdit
              ? "Update account details for this team member."
              : "Add a team member, review the details, then save."
          }
          actions={
            <Button type="button" variant="secondary" onClick={goBack}>
              Back to users
            </Button>
          }
        />

        <form
          className="wh-form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (isEdit) save();
            else if (phase === "review") save();
            else goToReview();
          }}
        >
          <FormPageAlerts error={error} />

          {(!isEdit && phase === "review") ? (
            <FormBlock title="Review" description="Confirm the details below before creating this user.">
              <div className="wh-review-stack">
                <ReviewRow label="Name" value={form.name.trim()} />
                <ReviewRow label="Email" value={form.email.trim()} />
                <ReviewRow label="Username" value={form.username.trim()} />
                <ReviewRow label="Phone" value={form.phone.trim() || "—"} />
                <ReviewRow label="Role" value={selectedRoleName} />
                <ReviewRow label="Status" value={form.status} />
                <ReviewRow label="Password" value="••••••••" />
              </div>
            </FormBlock>
          ) : (
            <FormBlock title="User details" description="Basic account information for this team member.">
              <div className="wh-form-grid">
                <FormField id="name" label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                <FormField id="email" label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
                <FormField id="username" label="Username" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
                <FormField id="phone" label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                {editingSuperAdmin ? (
                  <FormField id="role_id" label="Role" value={SUPER_ADMIN_ROLE_NAME} readOnly disabled />
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
                <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </FormField>
                <FormField
                  id="password"
                  label={isEdit ? "New password (optional)" : "Password"}
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={!isEdit}
                />
              </div>
            </FormBlock>
          )}

          <FormActions>
            {isEdit ? (
              <>
                <Button type="button" variant="secondary" onClick={goBack}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSave || saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : phase === "review" ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setPhase("form")}>
                  Back
                </Button>
                <Button type="submit" disabled={!canSave || saving}>
                  {saving ? "Creating…" : "Create user"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" onClick={goBack}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canCreate}>
                  Review
                </Button>
              </>
            )}
          </FormActions>
        </form>
      </FormPageLayout>

      <AccountDetailsModal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          navigate(`${MODULE_BASE}/user-management`);
        }}
        title={detailsTitle}
        sections={detailsSections}
      />

      <UnsavedChangesDialog open={dialogOpen} onStay={stayOnPage} onDiscard={leavePage} />
    </div>
  );
}
