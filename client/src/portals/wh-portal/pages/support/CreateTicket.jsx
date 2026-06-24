import { useState, useEffect } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch } from "../../../../api/client";

export default function CreateTicket() {
  const { authFetch } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({ tenant_id: "", subject: "", description: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch("/tenants?page=1&limit=200", {}, authFetch)
      .then((r) => setTenants(r.data || []))
      .catch(() => {});
  }, [authFetch]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!form.tenant_id) {
      setError("Select a tenant.");
      return;
    }
    if (!form.subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!form.description.trim()) {
      setError("Description is required.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(
        "/support-tickets",
        {
          method: "POST",
          body: JSON.stringify({
            tenant_id: Number(form.tenant_id),
            subject: form.subject.trim(),
            description: form.description.trim(),
            status: "open",
          }),
        },
        authFetch
      );
      setMessage("Support ticket created.");
      setForm({ tenant_id: "", subject: "", description: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wh-page">
      <PageHeader
        title="Create Support Ticket"
        description="Log client issues, requests, complaints, or technical problems on behalf of a tenant."
      />
      <Card>
        <form className="wh-form" onSubmit={handleSubmit}>
          <FormField id="tenant" label="Tenant" as="select" value={form.tenant_id} onChange={update("tenant_id")} required>
            <option value="">Choose a tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.company_name}</option>
            ))}
          </FormField>
          <FormField id="subject" label="Subject" value={form.subject} onChange={update("subject")} required />
          <FormField
            id="description"
            label="Description"
            as="textarea"
            rows={5}
            value={form.description}
            onChange={update("description")}
            required
          />
          {error && <p className="wh-field__error">{error}</p>}
          {message && <p className="wh-form-message">{message}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create Ticket"}</Button>
        </form>
      </Card>
    </div>
  );
}
