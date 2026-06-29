import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch, loginPortalUrl } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import { CopyIcon, EyeIcon, EyeOffIcon } from "../../../../../components/icons";
import { formatDateTime } from "../../../../../utils/dateTime";
import { copyToClipboard } from "../../../../../utils/copyToClipboard";
import {
  ProfileHero,
  EntityPanel,
  EntityDetailGrid,
  TenantsIcon,
  SubscriptionIcon,
  LogsIcon,
} from "../../../../../components/EntityView";

const MODULE_BASE = "/app/m/admin";
const MASK = "••••••••";

function SensitiveField({ label, value }) {
  const [visible, setVisible] = useState(false);
  const raw = value == null || value === "" ? "—" : String(value);
  const isSecret = raw !== "—";
  const display = isSecret && !visible ? MASK : raw;

  return (
    <div className="wh-entity-detail-grid__item wh-entity-detail-grid__item--full">
      <span className="wh-entity-detail-grid__label">{label}</span>
      <div className="wh-account-detail-row__value-wrap">
        <span className="wh-entity-detail-grid__value">{display}</span>
        {isSecret && (
          <>
            <button type="button" className="wh-account-detail-row__copy" onClick={() => setVisible((v) => !v)} aria-label="Toggle visibility">
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </button>
            <button type="button" className="wh-account-detail-row__copy" onClick={() => copyToClipboard(raw)} aria-label={`Copy ${label}`}>
              <CopyIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function UserView() {
  const { userId } = useParams();
  const { authFetch, user: authUser } = useAuth();
  const { canEdit } = useModulePermission("admin");
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userRes, creds] = await Promise.all([
        apiFetch(`/tenant/users/${userId}`, {}, authFetch),
        apiFetch(`/tenant/users/${userId}/credentials`, {}, authFetch),
      ]);
      setUser(userRes.data);
      setCredentials(creds);
    } catch (e) {
      setUser(null);
      setCredentials(null);
      setError(e.message || "User not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, userId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page wh-page--wide">
        <p className="wh-muted">Loading user…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wh-page wh-page--wide">
        <div className="wh-alert wh-alert--error">{error || "User not found"}</div>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/user-management`)}>Back to users</Button>
      </div>
    );
  }

  const loginPortal = credentials?.login_portal || authUser?.login_portal || "erp1";
  const loginLink = loginPortalUrl(loginPortal);

  return (
    <div className="wh-page wh-page--wide wh-entity-view">
      <PageHeader
        title={user.name}
        description={user.role_name || "Team member"}
        actions={
          <div className="wh-action-btns">
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/user-management`)}>All users</Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/user-management/edit/${userId}`)}>
                Edit user
              </Button>
            )}
          </div>
        }
      />

      <ProfileHero
        name={user.name}
        subtitle={user.role_name}
        status={user.status}
        contact={[
          { label: "Phone", value: user.phone, icon: "phone" },
          { label: "Email", value: user.email, icon: "email" },
          { label: "Username", value: user.username, icon: "user" },
        ]}
        highlights={[
          { label: "Role", value: user.role_name || "—", hint: user.status === "active" ? "Active account" : "Inactive account" },
          { label: "Last login", value: user.last_login_at ? formatDateTime(user.last_login_at) : "Never", hint: "Portal access" },
        ]}
        kpis={[
          { label: "Created", value: user.created_at ? formatDateTime(user.created_at) : "—", hint: "Account opened", icon: <LogsIcon /> },
          { label: "ERP portal", value: loginPortal.toUpperCase(), hint: "Sign-in portal", tone: "accent", icon: <SubscriptionIcon /> },
          { label: "User ID", value: String(user.id), hint: "Internal reference", icon: <TenantsIcon /> },
        ]}
      />

      <EntityPanel title="Sign-in details" subtitle="Portal credentials for this user" flush>
        <EntityDetailGrid
          rows={[
            { label: "Portal link", value: loginLink },
            { label: "Username", value: credentials?.username || user.username || user.email },
            { label: "Email", value: user.email },
            { label: "Role", value: user.role_name },
          ]}
        />
        <SensitiveField label="Password" value={credentials?.password} />
      </EntityPanel>
    </div>
  );
}
