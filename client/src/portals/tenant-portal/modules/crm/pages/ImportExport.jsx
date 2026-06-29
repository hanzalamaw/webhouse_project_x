import { useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import {
  LEAD_CSV_HEADERS,
  CUSTOMER_CSV_HEADERS,
  parseCsv,
  downloadCsv,
} from "../utils/csv";

const LEAD_TEMPLATE_ROW = {
  lead_name: "Jane Doe",
  phone: "03001234567",
  email: "jane@example.com",
  company_name: "Acme Ltd",
  source: "manual",
  status: "new",
  notes: "Met at trade expo",
  assigned_to_name: "",
};

const CUSTOMER_TEMPLATE_ROW = {
  customer_name: "Ali Khan",
  company_name: "Metro Store",
  customer_type: "retailer",
  phone: "03001112222",
  email: "ali@example.com",
  status: "active",
  tags: "vip|lahore",
  note: "Preferred contact via phone",
  billing_address: "12 Main Street",
  billing_city: "Lahore",
  billing_state: "Punjab",
  billing_postal_code: "54000",
};

function ImportResultCard({ title, result }) {
  if (!result) return null;
  return (
    <Card className="wh-inv-import-export__results">
      <h3 className="wh-card__title">{title}</h3>
      <p className="wh-card__text">
        Created: {result.created ?? 0}
        {result.updated != null && ` · Updated: ${result.updated}`}
        {result.skipped != null && ` · Skipped empty rows: ${result.skipped}`}
      </p>
      {result.errors?.length > 0 && (
        <ul className="wh-list">
          {result.errors.map((err) => (
            <li key={`err-${err.row}-${err.message}`}>Row {err.row}: {err.message}</li>
          ))}
        </ul>
      )}
      {result.warnings?.length > 0 && (
        <ul className="wh-list wh-inv-import-export__warnings">
          {result.warnings.map((w) => (
            <li key={`warn-${w.row}-${w.message}`}>Row {w.row}: {w.message}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function ImportExport() {
  const { authFetch } = useAuth();
  const { canCreate, canExport } = useModulePermission("crm");
  const [leadExporting, setLeadExporting] = useState(false);
  const [customerExporting, setCustomerExporting] = useState(false);
  const [leadImporting, setLeadImporting] = useState(false);
  const [customerImporting, setCustomerImporting] = useState(false);
  const [leadResult, setLeadResult] = useState(null);
  const [customerResult, setCustomerResult] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const dateStamp = new Date().toISOString().slice(0, 10);

  const exportLeads = async () => {
    if (!canExport) return;
    setLeadExporting(true);
    setError("");
    try {
      const res = await apiFetch("/crm/leads/export", {}, authFetch);
      downloadCsv(`crm-leads-${dateStamp}.csv`, LEAD_CSV_HEADERS, res.data || []);
      setMessage("Leads export downloaded.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLeadExporting(false);
    }
  };

  const exportCustomers = async () => {
    if (!canExport) return;
    setCustomerExporting(true);
    setError("");
    try {
      const res = await apiFetch("/crm/customers/export", {}, authFetch);
      downloadCsv(`crm-customers-${dateStamp}.csv`, CUSTOMER_CSV_HEADERS, res.data || []);
      setMessage("Customers export downloaded.");
    } catch (e) {
      setError(e.message);
    } finally {
      setCustomerExporting(false);
    }
  };

  const importLeads = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !canCreate) return;
    setLeadImporting(true);
    setError("");
    setMessage("");
    setLeadResult(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CSV file has no data rows");
      const res = await apiFetch("/crm/leads/import", { method: "POST", body: JSON.stringify({ rows }) }, authFetch);
      setLeadResult(res);
      setMessage(`Leads import finished: ${res.created} created.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLeadImporting(false);
      e.target.value = "";
    }
  };

  const importCustomers = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !canCreate) return;
    setCustomerImporting(true);
    setError("");
    setMessage("");
    setCustomerResult(null);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("CSV file has no data rows");
      const res = await apiFetch("/crm/customers/import", { method: "POST", body: JSON.stringify({ rows }) }, authFetch);
      setCustomerResult(res);
      setMessage(`Customers import finished: ${res.created} created, ${res.updated} updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCustomerImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="wh-page wh-inv-import-export">
      <PageHeader
        title="Import / Export"
        description="Bulk import or export leads and customers as CSV. Customer import updates existing records when phone or email matches."
      />

      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      {message && <div className="wh-alert wh-alert--success">{message}</div>}

      <h3 className="wh-card__title" style={{ marginTop: 8, marginBottom: 12 }}>Leads</h3>
      <div className="wh-inv-import-export__grid">
        <Card>
          <h3 className="wh-card__title">Export leads</h3>
          <p className="wh-card__text">
            Download all leads with contact details, source, status, notes, and assignee name.
          </p>
          <div className="wh-card__actions">
            {canExport ? (
              <Button onClick={exportLeads} disabled={leadExporting}>
                {leadExporting ? "Exporting…" : "Export CSV"}
              </Button>
            ) : (
              <p className="wh-muted">Export requires CRM export permission.</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="wh-card__title">Import leads</h3>
          <p className="wh-card__text">
            Upload a CSV file. Required: <strong>lead_name</strong>. Optional: phone, email, company_name, source, status, notes, assigned_to_name.
          </p>
          <p className="wh-card__text wh-muted wh-inv-import-export__note">
            Source defaults to csv_import when empty. Status defaults to new. You may use keys (manual) or labels (Manual, Website). Assignee must match a CRM user&apos;s name exactly.
          </p>
          <div className="wh-card__actions">
            <Button
              variant="secondary"
              onClick={() => downloadCsv("crm-leads-import-template.csv", LEAD_CSV_HEADERS, [LEAD_TEMPLATE_ROW])}
            >
              Download template
            </Button>
            {canCreate ? (
              <label className="wh-btn wh-btn--primary" style={{ cursor: "pointer" }}>
                {leadImporting ? "Importing…" : "Choose CSV file"}
                <input type="file" accept=".csv,text/csv" onChange={importLeads} disabled={leadImporting} style={{ display: "none" }} />
              </label>
            ) : (
              <p className="wh-muted">Import requires CRM create permission.</p>
            )}
          </div>
        </Card>
      </div>

      <ImportResultCard title="Lead import results" result={leadResult} />

      <h3 className="wh-card__title" style={{ marginTop: 24, marginBottom: 12 }}>Customers</h3>
      <div className="wh-inv-import-export__grid">
        <Card>
          <h3 className="wh-card__title">Export customers</h3>
          <p className="wh-card__text">
            Download all customers with type, status, tags, summary note, and default billing address fields.
          </p>
          <div className="wh-card__actions">
            {canExport ? (
              <Button onClick={exportCustomers} disabled={customerExporting}>
                {customerExporting ? "Exporting…" : "Export CSV"}
              </Button>
            ) : (
              <p className="wh-muted">Export requires CRM export permission.</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="wh-card__title">Import customers</h3>
          <p className="wh-card__text">
            Upload a CSV file. Required: <strong>customer_name</strong>. If phone or email matches an existing customer, that record is updated instead of duplicated.
          </p>
          <p className="wh-card__text wh-muted wh-inv-import-export__note">
            Tags use pipe separator (e.g. vip|wholesale). Billing address columns create a default address when none exists.
          </p>
          <div className="wh-card__actions">
            <Button
              variant="secondary"
              onClick={() => downloadCsv("crm-customers-import-template.csv", CUSTOMER_CSV_HEADERS, [CUSTOMER_TEMPLATE_ROW])}
            >
              Download template
            </Button>
            {canCreate ? (
              <label className="wh-btn wh-btn--primary" style={{ cursor: "pointer" }}>
                {customerImporting ? "Importing…" : "Choose CSV file"}
                <input type="file" accept=".csv,text/csv" onChange={importCustomers} disabled={customerImporting} style={{ display: "none" }} />
              </label>
            ) : (
              <p className="wh-muted">Import requires CRM create permission.</p>
            )}
          </div>
        </Card>
      </div>

      <ImportResultCard title="Customer import results" result={customerResult} />
    </div>
  );
}
