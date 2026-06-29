import { useState } from "react";
import { PageHeader } from "../../../components/PageHeader";
import { Card } from "../../../components/Card";
import { Button } from "../../../components/Button";
import { TenantSelect } from "../../../components/TenantSelect";
import { useAuth } from "../../../context/AuthContext";
import { apiFetch } from "../../../api/client";
import { stashImpersonationHandoff } from "./ImpersonationHandoff";

export default function Impersonation() {
  const { authFetch } = useAuth();
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
      const msg = err.message || "Impersonation failed.";
      setError(
        msg === "Forbidden"
          ? "Admin access required. Log out of any ERP session in this browser, then sign in again at the WebHouse admin portal."
          : msg
      );
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
          <TenantSelect
            id="impersonate_tenant"
            label="Tenant"
            value={tenantId}
            onChange={setTenantId}
          />
          <p className="wh-card__text">
            Impersonation opens the tenant ERP portal in a new browser tab. Your admin session stays active in this tab.
            If you see &quot;Forbidden&quot;, log out of any ERP session in this browser first, then sign in again as admin.
          </p>
          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Starting session…" : "Login as Client"}</Button>
        </form>
      </Card>
    </div>
  );
}
