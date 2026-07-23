import { useEffect, useMemo, useState } from "react";
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
import { MODULE_BASE, RECURRING_FREQUENCIES, RECURRING_STATUSES } from "../constants";
import { toInputDate } from "../../../../../utils/billing";

export default function CreateRecurringExpense() {
  const { recurringId } = useParams();
  const isEdit = Boolean(recurringId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("finance");
  const { amountLabel } = useMoney();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState({
    title: "",
    amount: "",
    frequency: "monthly",
    next_due_date: toInputDate(new Date()),
    status: "active",
    category_id: "",
    sub_category_id: "",
    bank_account_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/finance/expenses/reference", {}, authFetch),
      fetchAllTableRows("/finance/bank-accounts", authFetch),
      isEdit ? fetchAllTableRows("/finance/recurring-expenses", authFetch) : Promise.resolve([]),
    ])
      .then(([ref, banks, rows]) => {
        if (!active) return;
        setCategories(ref.categories || []);
        setSubCategories(ref.sub_categories || []);
        setBankAccounts(banks || []);
        if (isEdit) {
          const row = rows.find((r) => String(r.id) === String(recurringId));
          if (!row) throw new Error("Recurring expense not found");
          setForm({
            title: row.title || "",
            amount: String(row.amount ?? ""),
            frequency: row.frequency || "monthly",
            next_due_date: toInputDate(row.next_due_date),
            status: row.status || "active",
            category_id: String(row.category_id || ""),
            sub_category_id: row.sub_category_id ? String(row.sub_category_id) : "",
            bank_account_id: row.bank_account_id ? String(row.bank_account_id) : "",
          });
        } else if (ref.categories?.length) {
          setForm((f) => ({ ...f, category_id: String(ref.categories[0].id) }));
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authFetch, recurringId, isEdit]);

  const filteredSubs = useMemo(
    () => subCategories.filter((s) => String(s.category_id) === String(form.category_id)),
    [subCategories, form.category_id]
  );

  const disabled = isEdit ? !canEdit : !canCreate;

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        ...form,
        amount: Number(form.amount),
        category_id: Number(form.category_id),
        sub_category_id: form.sub_category_id ? Number(form.sub_category_id) : null,
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
      };
      if (isEdit) {
        await apiFetch(`/finance/recurring-expenses/${recurringId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        setMessage("Recurring expense updated successfully.");
      } else {
        await apiFetch("/finance/recurring-expenses", { method: "POST", body: JSON.stringify(body) }, authFetch);
        navigate(`${MODULE_BASE}/recurring-expenses`);
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
          title={isEdit ? "Edit recurring expense" : "Add recurring expense"}
          description="Schedule repeating expenses with optional bank auto-deduct."
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/recurring-expenses`)}>Back</Button>}
        />
        <FormPageAlerts error={error} message={message} />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Schedule" description="Amount, frequency, and next due date.">
            <div className="wh-form-grid">
              <FormField id="title" label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required disabled={disabled} />
              <FormField id="amount" label={amountLabel("Amount")} type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required disabled={disabled} />
              <FormField id="frequency" label="Frequency" as="select" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} disabled={disabled}>
                {RECURRING_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </FormField>
              <FormField id="next_due_date" label="Next due date" type="date" value={form.next_due_date} onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))} required disabled={disabled} />
              <FormField id="bank_account_id" label="Deduct from bank account" as="select" value={form.bank_account_id} onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))} disabled={disabled}>
                <option value="">No auto-deduct</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.bank_name} — {b.account_title} ({b.account_number})</option>
                ))}
              </FormField>
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {RECURRING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
          </FormBlock>
          <FormBlock title="Classification" description="Category groups the expense; sub-category is an optional finer label (e.g. Utilities → Internet).">
            <div className="wh-form-grid">
              <FormField id="category_id" label="Category" as="select" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value, sub_category_id: "" }))} required disabled={disabled}>
                <option value="">Select…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </FormField>
              <FormField id="sub_category_id" label="Sub-category (optional)" as="select" value={form.sub_category_id} onChange={(e) => setForm((f) => ({ ...f, sub_category_id: e.target.value }))} disabled={disabled || !filteredSubs.length}>
                <option value="">{filteredSubs.length ? "—" : "No sub-categories for this category"}</option>
                {filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.sub_category_name}</option>)}
              </FormField>
            </div>
          </FormBlock>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/recurring-expenses`)}>Cancel</Button>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
