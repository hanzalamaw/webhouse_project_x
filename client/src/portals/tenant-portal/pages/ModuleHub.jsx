import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../api/client";
import { PageHeader } from "../../../components/PageHeader";
import { Button } from "../../../components/Button";
import { moduleBasePath } from "../navConfig";
import "./ModuleHub.css";

export default function ModuleHub() {
  const { user, authFetch, logout } = useAuth();
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/tenant/modules", {}, authFetch);
        if (!cancelled) setModules(res.data || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load modules.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

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

      {!loading && !error && modules.length === 0 && (
        <p className="wh-muted">No modules are enabled for your organization yet.</p>
      )}

      {!loading && modules.length > 0 && (
        <div className="wh-module-grid">
          {modules.map((mod) => (
            <button
              key={mod.module_id}
              type="button"
              className="wh-module-card"
              onClick={() => navigate(`${moduleBasePath(mod.module_id)}/dashboard`)}
            >
              <span className="wh-module-card__icon" aria-hidden>
                {(mod.module_name || "M").charAt(0).toUpperCase()}
              </span>
              <span className="wh-module-card__name">{mod.module_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
