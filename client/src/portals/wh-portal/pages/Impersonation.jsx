import { useState } from "react";
import { PageHeader } from "../../../components/PageHeader";
import { Card } from "../../../components/Card";
import { FormField } from "../../../components/FormField";
import { Button } from "../../../components/Button";

export default function Impersonation() {
  const [tenant, setTenant] = useState("");
  const [message, setMessage] = useState("");

  const handleImpersonate = (e) => {
    e.preventDefault();
    if (!tenant.trim()) {
      setMessage("Enter a tenant to impersonate.");
      return;
    }
    setMessage(`Secure impersonation session for "${tenant}" will open the tenant portal in a new context.`);
  };

  return (
    <div className="wh-page">
      <PageHeader
        title="Impersonation"
        description="Securely access a client's portal to provide support and troubleshoot issues as that tenant."
      />
      <Card>
        <form className="wh-form" onSubmit={handleImpersonate}>
          <FormField
            id="tenant"
            label="Tenant"
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            placeholder="Search tenant by company name or ID"
          />
          <p className="wh-card__text">
            Impersonation creates an audited, time-limited session. All actions are logged under your admin
            account for compliance and security.
          </p>
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit">Login as Client</Button>
        </form>
      </Card>
    </div>
  );
}
