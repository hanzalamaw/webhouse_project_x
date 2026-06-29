import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { useFiscalYear } from "../../../../../context/FiscalYearContext";
import { apiFetch, loginPortalUrl } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Button } from "../../../../../components/Button";
import { DashboardFilter } from "../../../../../components/DashboardFilter";
import { CopyIcon, EyeIcon, EyeOffIcon } from "../../../../../components/icons";
import { formatDateTime, formatDate } from "../../../../../utils/dateTime";
import { copyToClipboard } from "../../../../../utils/copyToClipboard";
import {
  createThisMonthDashboardFilter,
  filterRowsByDashboard,
  getPreviousPeriodFilter,
  countInDashboardFilter,
  formatComparisonHint,
} from "../../../../../utils/dashboardFilter";
import {
  ProfileHero,
  EntityPanel,
  EntityDetailGrid,
  TenantsIcon,
  SubscriptionIcon,
  LogsIcon,
  SinceIcon,
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
  const [dashFilter, setDashFilter] = useState(createThisMonthDashboardFilter);
  const fiscalYearStart = useFiscalYear();

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

  const sessions = user?.sessions || [];
  const activities = user?.activities || [];

  const sessionRows = useMemo(
    () => sessions.filter((s) => s.login_at).map((s) => ({ created_at: s.login_at })),
    [sessions]
  );

  const filterRows = useMemo(
    () => [...sessionRows, ...activities],
    [sessionRows, activities]
  );

  const prevFilter = useMemo(
    () => getPreviousPeriodFilter(dashFilter, fiscalYearStart),
    [dashFilter, fiscalYearStart]
  );

  const periodMetrics = useMemo(() => {
    const logins = countInDashboardFilter(sessionRows, "created_at", dashFilter, fiscalYearStart);
    const actions = countInDashboardFilter(activities, "created_at", dashFilter, fiscalYearStart);

    let prevLogins = 0;
    let prevActions = 0;
    if (prevFilter) {
      prevLogins = countInDashboardFilter(sessionRows, "created_at", prevFilter, fiscalYearStart);
      prevActions = countInDashboardFilter(activities, "created_at", prevFilter, fiscalYearStart);
    }

    return {
      logins,
      actions,
      loginsHint: formatComparisonHint(logins, prevLogins, dashFilter),
      actionsHint: formatComparisonHint(actions, prevActions, dashFilter),
      activityHint: formatComparisonHint(logins + actions, prevLogins + prevActions, dashFilter),
    };
  }, [sessionRows, activities, dashFilter, prevFilter, fiscalYearStart]);

  const filteredSessions = useMemo(
    () => filterRowsByDashboard(sessionRows, "created_at", dashFilter, fiscalYearStart),
    [sessionRows, dashFilter, fiscalYearStart]
  );

  const filteredActivities = useMemo(
    () => filterRowsByDashboard(activities, "created_at", dashFilter, fiscalYearStart),
    [activities, dashFilter, fiscalYearStart]
  );

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

      <DashboardFilter
        rows={filterRows}
        dateField="created_at"
        value={dashFilter}
        onChange={setDashFilter}
      />

      <ProfileHero
        className="wh-entity-profile--entity"
        variant="split"
        name={user.name}
        subtitle={user.role_name}
        status={user.status}
        contact={[
          { label: "Phone", value: user.phone, icon: "phone" },
          { label: "Email", value: user.email, icon: "email" },
          { label: "Username", value: user.username, icon: "user" },
        ]}
        kpis={[
          {
            label: "Logins",
            value: String(periodMetrics.logins),
            hint: periodMetrics.loginsHint.text,
            hintTone: periodMetrics.loginsHint.tone,
            tone: "accent",
            icon: <LogsIcon />,
          },
          {
            label: "Actions",
            value: String(periodMetrics.actions),
            hint: periodMetrics.actionsHint.text,
            hintTone: periodMetrics.actionsHint.tone,
            tone: "success",
            icon: <TenantsIcon />,
          },
          {
            label: "Member since",
            value: user.created_at ? formatDate(user.created_at) : "—",
            hint: periodMetrics.activityHint.text,
            hintTone: periodMetrics.activityHint.tone,
            icon: <SinceIcon />,
            valueVariant: "date",
          },
          {
            label: "Last login",
            value: user.last_login_at ? formatDateTime(user.last_login_at) : "Never",
            hint: periodMetrics.loginsHint.text,
            hintTone: periodMetrics.loginsHint.tone,
            icon: <SubscriptionIcon />,
          },
        ]}
      />

      <EntityPanel title="Sign-in details" subtitle="Portal credentials for this user" flush>
        <EntityDetailGrid
          rows={[
            { label: "Portal link", value: loginLink },
            { label: "Username", value: credentials?.username || user.username || user.email },
            { label: "Email", value: user.email },
            { label: "Role", value: user.role_name },
            { label: "ERP portal", value: loginPortal.toUpperCase() },
          ]}
        />
        <SensitiveField label="Password" value={credentials?.password} />
      </EntityPanel>

      {filteredActivities.length > 0 && (
        <EntityPanel title="Recent activity" subtitle="Actions by this user in the selected period" flush>
          <div className="wh-mini-list">
            {filteredActivities.slice(0, 12).map((a) => (
              <div className="wh-mini-row" key={a.id}>
                <div className="wh-mini-row__main">
                  <div className="wh-mini-row__title">{a.action?.replace(/_/g, " ") || "Activity"}</div>
                  <div className="wh-mini-row__sub">
                    {[a.module_name, formatDateTime(a.created_at)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </EntityPanel>
      )}
    </div>
  );
}
