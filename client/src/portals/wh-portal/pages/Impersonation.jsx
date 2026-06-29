import { useState } from "react";
import { PageHeader } from "../../../components/PageHeader";
import { Button } from "../../../components/Button";
import { FormBlock } from "../../../components/FormBlock";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../components/FormPageLayout";
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
      setError("Please select a tenant.");
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
        setError("Your browser blocked the pop-up. Allow pop-ups for this site and try again.");
        return;
      }
      setMessage("Tenant portal opened in a new tab. Your admin session stays active in this tab.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Impersonation"
          description="Securely access a client's portal to provide support and troubleshoot issues as that tenant."
        />
        <form onSubmit={handleImpersonate} className="wh-form-stack">
          <FormPageAlerts error={error} message={message} />
          <FormBlock
            title="Select tenant"
            description="Impersonation opens the tenant ERP portal in a new browser tab. Your admin session stays active in this tab."
          >
            <TenantSelect
              id="impersonate_tenant"
              label="Tenant"
              value={tenantId}
              onChange={setTenantId}
            />
          </FormBlock>
          <FormActions>
            <Button type="submit" disabled={loading}>
              {loading ? "Starting session…" : "Login as Client"}
            </Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
