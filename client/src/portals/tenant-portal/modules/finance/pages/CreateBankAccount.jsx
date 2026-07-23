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
import { MODULE_BASE, BANK_ACCOUNT_STATUSES } from "../constants";

export default function CreateBankAccount() {
  const { accountId } = useParams();
  const isEdit = Boolean(accountId);
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("finance");
  const { amountLabel } = useMoney();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    bank_name: "",
    account_title: "",
    account_number: "",
    current_balance: "0",
    status: "active",
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    fetchAllTableRows("/finance/bank-accounts", authFetch)
      .then((rows) => {
        if (!active) return;
        const row = rows.find((r) => String(r.id) === String(accountId));
        if (!row) throw new Error("Account not found");
        setForm({
          bank_name: row.bank_name || "",
          account_title: row.account_title || "",
          account_number: row.account_number || "",
          current_balance: String(row.current_balance ?? 0),
          status: row.status || "active",
        });
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [authFetch, accountId, isEdit]);

  const disabled = isEdit ? !canEdit : !canCreate;

  const submit = async (e) => {
    e.preventDefault();
    if (disabled) return;
    setSaving(true);
    setError("");
    try {
      const body = { ...form, current_balance: Number(form.current_balance) };
      if (isEdit) {
        await apiFetch(`/finance/bank-accounts/${accountId}`, { method: "PUT", body: JSON.stringify(body) }, authFetch);
        setMessage("Bank account updated successfully.");
      } else {
        await apiFetch("/finance/bank-accounts", { method: "POST", body: JSON.stringify(body) }, authFetch);
        navigate(`${MODULE_BASE}/bank-accounts`);
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
          title={isEdit ? "Edit bank account" : "Add bank account"}
          description="Track balances used for expenses and recurring deductions."
          actions={<Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/bank-accounts`)}>Back</Button>}
        />
        <FormPageAlerts error={error} message={message} />
        <form className="wh-form-stack" onSubmit={submit}>
          <FormBlock title="Account details" description="Bank name, account title, and number.">
            <div className="wh-form-grid">
              <FormField id="bank_name" label="Bank name" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} required disabled={disabled} />
              <FormField id="account_title" label="Account title" value={form.account_title} onChange={(e) => setForm((f) => ({ ...f, account_title: e.target.value }))} required disabled={disabled} />
              <FormField id="account_number" label="Account number" value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} required disabled={disabled} />
              <FormField id="current_balance" label={amountLabel("Current balance")} type="number" step="0.01" value={form.current_balance} onChange={(e) => setForm((f) => ({ ...f, current_balance: e.target.value }))} disabled={disabled} />
              <FormField id="status" label="Status" as="select" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} disabled={disabled}>
                {BANK_ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </FormField>
            </div>
          </FormBlock>
          <FormActions>
            <Button type="button" variant="secondary" onClick={() => navigate(`${MODULE_BASE}/bank-accounts`)}>Cancel</Button>
            <Button type="submit" disabled={saving || disabled}>{saving ? "Saving…" : isEdit ? "Update" : "Create"}</Button>
          </FormActions>
        </form>
      </FormPageLayout>
    </div>
  );
}
