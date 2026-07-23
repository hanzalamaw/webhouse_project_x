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
import { MODULE_BASE, EXPENSE_PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "../constants";
import { toInputDate } from "../../../../../utils/billing";

export default function CreateExpense() {
  const { expenseId } = useParams();
  const isEdit = Boolean(expenseId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("finance");
  const { amountLabel } = useMoney();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [form, setForm] = useState({
    expense_title: "",
    amount: "",
    payment_method: "cash",
    expense_date: toInputDate(new Date()),
    notes: "",
    category_id: "",
    sub_category_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch("/finance/expenses/reference", {}, authFetch),
      isEdit ? fetchAllTableRows("/finance/expenses", authFetch) : Promise.resolve([]),
    ])
      .then(([ref, rows]) => {
        if (!active) return;
        setCategories(ref.categories || []);
        setSubCategories(ref.sub_categories || []);
        if (isEdit) {
          const row = rows.find((r) => String(r.id) === String(expenseId));
          if (!row) throw new Error("Expense not found");
          setForm({
            expense_title: row.expense_title || "",
            amount: String(row.amount ?? ""),
            payment_method: row.payment_method || "cash",
            expense_date: toInputDate(row.expense_date),
            notes: row.notes || "",
            category_id: String(row.category_id || ""),
            sub_category_id: row.sub_category_id ? String(row.sub_category_id) : "",
          });
        } else if (ref.categories?.length) {
          setForm((f) => ({ ...f, category_id: String(ref.categories[0].id) }));
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authFetch, expenseId, isEdit]);

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
      };
      if (isEdit) {
        await apiFetch(`/finance/expenses/${expenseId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        setMessage("Expense updated successfully.");
      } else {
        await apiFetch("/finance/expenses", { method: "POST", body: JSON.stringify(body) }, authFetch);
        navigate(`${MODULE_BASE}/expenses`);
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
          title={isEdit ? "Edit expense" : "Add expense"}
          description="Record a one-time business expense."
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/expenses`)}>Back</Button>}
        />
        <FormPageAlerts error={error} message={message} />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Expense details" description="Title, amount, category, and payment method. Sub-category is optional for finer reporting.">
            <div className="wh-form-grid">
              <FormField id="expense_title" label="Title" value={form.expense_title} onChange={(e) => setForm((f) => ({ ...f, expense_title: e.target.value }))} required disabled={disabled} />
              <FormField id="amount" label={amountLabel("Amount")} type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required disabled={disabled} />
              <FormField id="category_id" label="Category" as="select" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value, sub_category_id: "" }))} required disabled={disabled}>
                <option value="">Select…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </FormField>
              <FormField id="sub_category_id" label="Sub-category (optional)" as="select" value={form.sub_category_id} onChange={(e) => setForm((f) => ({ ...f, sub_category_id: e.target.value }))} disabled={disabled || !filteredSubs.length}>
                <option value="">{filteredSubs.length ? "—" : "No sub-categories for this category"}</option>
                {filteredSubs.map((s) => <option key={s.id} value={s.id}>{s.sub_category_name}</option>)}
              </FormField>
              <FormField id="payment_method" label="Payment method" as="select" value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} disabled={disabled}>
                {EXPENSE_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</option>)}
              </FormField>
              <FormField id="expense_date" label="Expense date" type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} required disabled={disabled} />
            </div>
          </FormBlock>
          <FormBlock title="Notes" description="Optional context for this expense.">
            <FormField id="notes" label="Notes" as="textarea" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={disabled} />
          </FormBlock>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/expenses`)}>Cancel</Button>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
