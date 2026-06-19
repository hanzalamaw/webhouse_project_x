import { useState } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";

const emptyForm = {
  company_name: "",
  owner_name: "",
  owner_email: "",
  owner_phone: "",
  industry: "",
  plan: "",
};

export default function CreateTenant() {
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setMessage("Tenant creation will be connected to the API. Form captured successfully.");
  };

  return (
    <div className="wh-page">
      <PageHeader
        title="Create Tenant"
        description="Create new client accounts with company details, owner information, and initial subscription."
      />
      <Card>
        <form className="wh-form" onSubmit={handleSubmit}>
          <div className="wh-form-grid">
            <FormField id="company_name" label="Company Name" value={form.company_name} onChange={update("company_name")} placeholder="Acme Corp" />
            <FormField id="owner_name" label="Owner Name" value={form.owner_name} onChange={update("owner_name")} placeholder="Jane Smith" />
            <FormField id="owner_email" label="Owner Email" type="email" value={form.owner_email} onChange={update("owner_email")} placeholder="owner@company.com" />
            <FormField id="owner_phone" label="Owner Phone" value={form.owner_phone} onChange={update("owner_phone")} placeholder="+1 555 0100" />
            <FormField id="industry" label="Industry" value={form.industry} onChange={update("industry")} placeholder="Retail" />
            <FormField id="plan" label="Subscription Plan" value={form.plan} onChange={update("plan")} placeholder="Professional" />
          </div>
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit">Create Tenant</Button>
        </form>
      </Card>
    </div>
  );
}
