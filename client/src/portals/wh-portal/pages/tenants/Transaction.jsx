import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { StatCard } from "../../../../components/StatCard";
import { DataTable } from "../../../../components/DataTable";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { formatPKR } from "../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../utils/dateTime";
import { addPaymentReceived, toInputDate } from "../../../../utils/billing";

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function fromDatetimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function Transaction() {
  const { authFetch } = useAuth();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ bank: "", cash: "", received_at: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSummary = useCallback(async () => {
    const data = await apiFetch("/transactions/summary", {}, authFetch);
    setSummary(data);
  }, [authFetch]);

  const loadPayments = useCallback(async () => {
    const data = await fetchAllTableRows("/transactions/payments", authFetch);
    setRows(data);
  }, [authFetch]);

  const reload = useCallback(async () => {
    await Promise.all([loadSummary(), loadPayments()]);
  }, [loadSummary, loadPayments]);

  useEffect(() => {
    setLoading(true);
    reload().catch(() => {}).finally(() => setLoading(false));
  }, [reload]);

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      bank: String(row.bank ?? 0),
      cash: String(row.cash ?? 0),
      received_at: toDatetimeLocal(row.received_at),
    });
    setFormError("");
  };

  const closeEdit = () => {
    setEditRow(null);
    setFormError("");
  };

  const periodTotal = editRow?.period_total ?? 0;
  const otherPaid = useMemo(() => {
    if (!editRow) return 0;
    return rows
      .filter((r) => r.tenant_id === editRow.tenant_id && r.id !== editRow.id)
      .reduce((sum, r) => sum + Number(r.total_received || 0), 0);
  }, [editRow, rows]);

  const formTotal = addPaymentReceived(form.bank, form.cash);
  const maxAllowed = Math.max(0, Number((periodTotal - otherPaid).toFixed(2)));

  const validateForm = () => {
    const bank = Number(form.bank);
    const cash = Number(form.cash);
    if (Number.isNaN(bank) || bank < 0) return "Bank amount cannot be negative.";
    if (Number.isNaN(cash) || cash < 0) return "Cash amount cannot be negative.";
    if (formTotal > maxAllowed + 0.001) {
      return `Total received cannot exceed ${formatPKR(maxAllowed)} for this subscription period.`;
    }
    return "";
  };

  const saveEdit = async () => {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await apiFetch(
        `/transactions/payments/${editRow.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            bank: Number(form.bank) || 0,
            cash: Number(form.cash) || 0,
            received_at: fromDatetimeLocal(form.received_at),
          }),
        },
        authFetch
      );
      closeEdit();
      await reload();
    } catch (e) {
      setFormError(e.message || "Failed to update transaction");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "company_name", label: "Tenant" },
    { key: "plan_name", label: "Plan", format: (v) => v || "—" },
    { key: "billing_cycle", label: "Cycle" },
    { key: "start_date", label: "Start Date", filterType: "date", format: formatDate },
    { key: "end_date", label: "End Date", filterType: "date", format: formatDate },
    { key: "period_total", label: "Period Total", format: (_, r) => formatPKR(r.period_total) },
    { key: "total_received", label: "Received", format: (_, r) => formatPKR(r.total_received) },
    { key: "amount_due", label: "Due", format: (_, r) => formatPKR(r.amount_due) },
    { key: "bank", label: "Bank", format: (_, r) => formatPKR(r.bank) },
    { key: "cash", label: "Cash", format: (_, r) => formatPKR(r.cash) },
    { key: "received_at", label: "Received At", filterType: "date", format: formatDateTime },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Transaction"
        description="Track tenant payments, outstanding dues, and billing activity."
      />
      <div className="wh-stat-grid">
        <StatCard
          label="Outstanding Dues"
          value={loading ? "—" : formatPKR(summary?.outstanding_dues)}
          tone="warning"
        />
        <StatCard
          label="Received This Month"
          value={loading ? "—" : formatPKR(summary?.received_this_month)}
          tone="success"
        />
      </div>
      <Card>
        <h3 className="wh-card__title">Payment History</h3>
        {loading ? (
          <p className="wh-muted">Loading transactions…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            filterRows={rows}
            page={page}
            pageSize={TABLE_PAGE_SIZE}
            onPageChange={setPage}
            onRowClick={openEdit}
            emptyMessage="No payment records yet."
          />
        )}
      </Card>

      {editRow && (
        <div className="wh-modal-overlay" onClick={closeEdit}>
          <div className="wh-modal wh-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="wh-modal__title">Edit Transaction — {editRow.company_name}</h3>
            <div className="wh-form-grid">
              <FormField id="tx_plan" label="Plan" value={editRow.plan_name || "—"} readOnly />
              <FormField id="tx_cycle" label="Billing Cycle" value={editRow.billing_cycle || "—"} readOnly />
              <FormField id="tx_start" label="Start Date" value={toInputDate(editRow.start_date)} readOnly />
              <FormField id="tx_end" label="End Date" value={toInputDate(editRow.end_date)} readOnly />
              <FormField id="tx_period" label="Period Total" value={formatPKR(periodTotal)} readOnly />
              <FormField
                id="tx_bank"
                label="Bank (Rs.)"
                type="number"
                step="0.01"
                min="0"
                value={form.bank}
                onChange={(e) => {
                  setFormError("");
                  setForm((f) => ({ ...f, bank: e.target.value }));
                }}
              />
              <FormField
                id="tx_cash"
                label="Cash (Rs.)"
                type="number"
                step="0.01"
                min="0"
                value={form.cash}
                onChange={(e) => {
                  setFormError("");
                  setForm((f) => ({ ...f, cash: e.target.value }));
                }}
              />
              <FormField id="tx_total" label="Total Received (Rs.)" value={formatPKR(formTotal)} readOnly />
              <FormField
                id="tx_received"
                label="Received At"
                type="datetime-local"
                value={form.received_at}
                onChange={(e) => setForm((f) => ({ ...f, received_at: e.target.value }))}
              />
            </div>
            {formError && <p className="wh-field__error">{formError}</p>}
            <div className="wh-modal__actions">
              <Button variant="secondary" onClick={closeEdit}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
