import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../components/PageHeader";
import { Button } from "../../../components/Button";
import { useAuth } from "../../../context/AuthContext";
import { moduleBasePath } from "../modules/registry";
import { useTenantModules } from "../hooks/useTenantModules";
import "./ModuleHub.css";

export default function ModuleHub() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { visible, loading, error } = useTenantModules();

  return (
    <div className="wh-module-hub">
      {user?.impersonating && (
        <div className="wh-impersonation-banner">
          <span>
            You are impersonating <strong>{user.tenant_name}</strong> (admin support session).
          </span>
          <Button type="button" variant="secondary" className="wh-btn--sm" onClick={logout}>
            End session
          </Button>
        </div>
      )}

      <PageHeader
        title="Modules"
        description={`Select a module to open ${user?.tenant_name || "your workspace"}.`}
        actions={
          <Button type="button" variant="secondary" onClick={logout}>
            Log out
          </Button>
        }
      />

      {error && <p className="wh-field__error">{error}</p>}
      {loading && <p className="wh-muted">Loading modules…</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="wh-muted">No modules are enabled for your organization yet.</p>
      )}

      {!loading && visible.length > 0 && (
        <div className="wh-module-grid">
          {visible.map((mod) => (
            <button
              key={mod.slug}
              type="button"
              className="wh-module-card"
              onClick={() => navigate(`${moduleBasePath(mod.slug)}/dashboard`)}
            >
              <span className="wh-module-card__icon" aria-hidden>
                {mod.letter}
              </span>
              <span className="wh-module-card__name">{mod.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
