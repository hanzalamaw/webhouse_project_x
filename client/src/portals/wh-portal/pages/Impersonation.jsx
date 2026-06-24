import { useState, useEffect } from "react";
import { PageHeader } from "../../../components/PageHeader";
import { Card } from "../../../components/Card";
import { FormField } from "../../../components/FormField";
import { Button } from "../../../components/Button";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../api/client";
import { stashImpersonationHandoff } from "./ImpersonationHandoff";

export default function Impersonation() {
  const { authFetch } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/tenants?page=1&limit=200", {}, authFetch)
      .then((r) => setTenants(r.data || []))
      .catch(() => {});
  }, [authFetch]);

  const handleImpersonate = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!tenantId) {
      setError("Select a tenant to impersonate.");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch(
        "/impersonate",
        { method: "POST", body: JSON.stringify({ tenant_id: Number(tenantId) }) },
        authFetch
      );
      const handoffKey = stashImpersonationHandoff({
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
      });
      const handoffUrl = `${window.location.origin}/webhouse-portal/impersonate/session?handoff=${handoffKey}`;
      const tab = window.open(handoffUrl, "_blank", "noopener,noreferrer");
      if (!tab) {
        setError("Pop-up blocked. Allow pop-ups for this site and try again.");
        return;
      }
      setMessage("Tenant portal opened in a new tab. Your admin session remains active here.");
    } catch (err) {
      setError(err.message || "Impersonation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wh-page">
      <PageHeader
        title="Impersonation"
        description="Securely access a client's portal to provide support and troubleshoot issues as that tenant."
      />
      <Card>
        <form className="wh-form" onSubmit={handleImpersonate}>
          <FormField id="tenant" label="Tenant" as="select" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
            <option value="">Choose a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.company_name}</option>
            ))}
          </FormField>
          <p className="wh-card__text">
            Impersonation opens the tenant ERP portal in a new browser tab. All actions are logged under your admin account.
          </p>
          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Starting session…" : "Login as Client (new tab)"}</Button>
        </form>
      </Card>
    </div>
  );
}
