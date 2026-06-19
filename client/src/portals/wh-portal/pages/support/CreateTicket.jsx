import { useState } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";

export default function CreateTicket() {
  const [form, setForm] = useState({ tenant: "", subject: "", description: "", priority: "medium" });
  const [message, setMessage] = useState("");

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setMessage("Support ticket draft saved. API integration pending.");
  };

  return (
    <div className="wh-page">
      <PageHeader
        title="Create Support Ticket"
        description="Log client issues, requests, complaints, or technical problems on behalf of a tenant."
      />
      <Card>
        <form className="wh-form" onSubmit={handleSubmit}>
          <FormField id="tenant" label="Tenant" value={form.tenant} onChange={update("tenant")} placeholder="Select or search tenant" />
          <FormField id="subject" label="Subject" value={form.subject} onChange={update("subject")} placeholder="Brief summary" />
          <FormField
            id="description"
            label="Description"
            as="textarea"
            rows={5}
            value={form.description}
            onChange={update("description")}
            placeholder="Describe the issue in detail"
          />
          <FormField id="priority" label="Priority" as="select" value={form.priority} onChange={update("priority")}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </FormField>
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit">Create Ticket</Button>
        </form>
      </Card>
    </div>
  );
}
