import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { useMoney } from "../../../../../hooks/useMoney";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageLayout, FormPageAlerts, FormActions } from "../../../../../components/FormPageLayout";
import { FormBlock } from "../../../../../components/FormBlock";
import { FormField } from "../../../../../components/FormField";
import { Button } from "../../../../../components/Button";
import { MODULE_BASE, VENDOR_BILL_STATUSES } from "../constants";
import { toInputDate } from "../../../../../utils/billing";

export default function CreateVendorBill() {
  const { billId } = useParams();
  const isEdit = Boolean(billId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("finance");
  const { amountLabel } = useMoney();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    vendor_name: "",
    bill_no: "",
    bill_amount: "",
    due_date: toInputDate(new Date()),
    status: "unpaid",
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    fetchAllTableRows("/finance/vendor-bills", authFetch)
      .then((rows) => {
        if (!active) return;
        const row = rows.find((r) => String(r.id) === String(billId));
        if (!row) throw new Error("Bill not found");
        setForm({
          vendor_name: row.vendor_name || "",
          bill_no: row.bill_no || "",
          bill_amount: String(row.bill_amount ?? ""),
          due_date: toInputDate(row.due_date),
          status: row.status || "unpaid",
        });
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authFetch, billId, isEdit]);

  const disabled = isEdit ? !canEdit : !canCreate;

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = { ...form, bill_amount: Number(form.bill_amount) };
      if (isEdit) {
        await apiFetch(`/finance/vendor-bills/${billId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        setMessage("Vendor bill updated successfully.");
      } else {
        await apiFetch("/finance/vendor-bills", { method: "POST", body: JSON.stringify(body) }, authFetch);
        navigate(`${MODULE_BASE}/vendor-bills`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="wh-page"><FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout></div>;
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={isEdit ? "Edit vendor bill" : "Add vendor bill"}
          description="Record a vendor invoice and track payment status."
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/vendor-bills`)}>Back</Button>}
        />
        <FormPageAlerts error={error} message={message} />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Bill details" description="Vendor, amount, and due date.">
            <div className="wh-form-grid">
              <FormField id="vendor_name" label="Vendor name" value={form.vendor_name} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))} required disabled={disabled} />
              <FormField id="bill_no" label="Bill #" value={form.bill_no} onChange={(e) => setForm((f) => ({ ...f, bill_no: e.target.value }))} required disabled={disabled} />
              <FormField id="bill_amount" label={amountLabel("Bill amount")} type="number" step="0.01" min="0" value={form.bill_amount} onChange={(e) => setForm((f) => ({ ...f, bill_amount: e.target.value }))} required disabled={disabled} />
              <FormField id="due_date" label="Due date" type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} required disabled={disabled} />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {VENDOR_BILL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
          </FormBlock>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/vendor-bills`)}>Cancel</Button>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
