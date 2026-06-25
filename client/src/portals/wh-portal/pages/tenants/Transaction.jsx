import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "../../../../components/PageHeader";
import { Card } from "../../../../components/Card";
import { StatCard } from "../../../../components/StatCard";
import { DataTable } from "../../../../components/DataTable";
import { TableToolbar } from "../../../../components/TableToolbar";
import { FormField } from "../../../../components/FormField";
import { Button } from "../../../../components/Button";
import { Modal } from "../../../../components/Modal";
import { ConfirmDeleteModal } from "../../../../components/ConfirmDeleteModal";
import { useAuth } from "../../../../context/AuthContext";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../api/client";
import { formatPKR } from "../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../utils/dateTime";
import { addPaymentReceived, toInputDate } from "../../../../utils/billing";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../utils/tableFilters";

function SummaryGrid({ items }) {
  return (
    <div className="wh-tx-summary-grid">
      {items.map(({ label, value, accent }) => (
        <div key={label} className="wh-tx-summary-item">
          <span className="wh-tx-summary-item__label">{label}</span>
          <span className={`wh-tx-summary-item__value${accent ? " wh-tx-summary-item__value--accent" : ""}`}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function sumField(payments, field) {
  return payments.reduce((sum, p) => sum + Number(p[field] || 0), 0);
}

export default function Transaction() {
  const { authFetch } = useAuth();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [tenantPayments, setTenantPayments] = useState([]);
  const [tenantPaymentsLoading, setTenantPaymentsLoading] = useState(false);
  const [contextRow, setContextRow] = useState(null);
  const [addForm, setAddForm] = useState({ bank: "", cash: "" });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [fixPayment, setFixPayment] = useState(null);
  const [fixForm, setFixForm] = useState({ bank: "", cash: "" });
  const [fixError, setFixError] = useState("");
  const [fixing, setFixing] = useState(false);
  const [deletePayment, setDeletePayment] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });
  const [loadError, setLoadError] = useState("");

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "cycle_start" }),
    [rows, toolbar]
  );

  const formatElapsedPeriods = (row) => {
    const n = Number(row?.elapsed_periods);
    if (!n) return "—";
    if (row.billing_cycle === "yearly") {
      return `${n} year${n === 1 ? "" : "s"}`;
    }
    return `${n} month${n === 1 ? "" : "s"}`;
  };

  const periodTotal = contextRow?.total_billing_amount ?? contextRow?.period_total ?? 0;
  const currentCycleAmount = contextRow?.current_cycle_amount ?? 0;
  const currentCycleReceived = contextRow?.current_cycle_received ?? 0;
  const currentCycleDue = contextRow?.current_cycle_due ?? 0;
  const tenantPaidCurrent = useMemo(
    () => sumField(tenantPayments, "total_received"),
    [tenantPayments]
  );
  const tenantBankCurrent = useMemo(() => sumField(tenantPayments, "bank"), [tenantPayments]);
  const tenantCashCurrent = useMemo(() => sumField(tenantPayments, "cash"), [tenantPayments]);
  const currentPending = Math.max(0, Number((periodTotal - tenantPaidCurrent).toFixed(2)));

  const addBank = Number(addForm.bank) || 0;
  const addCash = Number(addForm.cash) || 0;
  const addTotal = addPaymentReceived(addForm.bank, addForm.cash);
  const newTenantPaid = tenantPaidCurrent + addTotal;
  const newPending = Math.max(0, Number((periodTotal - newTenantPaid).toFixed(2)));
  const maxAddAllowed = Math.max(0, Number((periodTotal - tenantPaidCurrent).toFixed(2)));

  const fixOtherPaid = useMemo(() => {
    if (!fixPayment) return 0;
    return tenantPayments
      .filter((p) => p.id !== fixPayment.id)
      .reduce((sum, p) => sum + Number(p.total_received || 0), 0);
  }, [tenantPayments, fixPayment]);

  const fixTotal = addPaymentReceived(fixForm.bank, fixForm.cash);
  const fixMaxAllowed = Math.max(0, Number((periodTotal - fixOtherPaid).toFixed(2)));

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const loadSummary = useCallback(async () => {
    const data = await apiFetch("/transactions/summary", {}, authFetch);
    setSummary(data);
  }, [authFetch]);

  const loadTenants = useCallback(async () => {
    const data = await fetchAllTableRows("/transactions/tenants", authFetch);
    setRows(data);
  }, [authFetch]);

  const loadTenantPayments = useCallback(
    async (tenantId) => {
      setTenantPaymentsLoading(true);
      try {
        const res = await apiFetch(`/transactions/tenant/${tenantId}/payments`, {}, authFetch);
        setTenantPayments(res.data || []);
      } catch {
        setTenantPayments([]);
      } finally {
        setTenantPaymentsLoading(false);
      }
    },
    [authFetch]
  );

  const reload = useCallback(async () => {
    setLoadError("");
    try {
      await Promise.all([loadSummary(), loadTenants()]);
    } catch (err) {
      setLoadError(err.message || "Failed to load transactions");
      setRows([]);
    }
  }, [loadSummary, loadTenants]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const openAddModal = async (row) => {
    setContextRow(row);
    setAddModalOpen(true);
    setAddForm({ bank: "", cash: "" });
    setAddError("");
    await loadTenantPayments(row.tenant_id);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setContextRow(null);
    setTenantPayments([]);
    setAddForm({ bank: "", cash: "" });
    setAddError("");
  };

  const openFixModal = (payment) => {
    setFixPayment(payment);
    setFixForm({
      bank: String(payment.bank ?? 0),
      cash: String(payment.cash ?? 0),
    });
    setFixError("");
  };

  const closeFixModal = () => {
    setFixPayment(null);
    setFixForm({ bank: "", cash: "" });
    setFixError("");
  };

  const validateAdd = () => {
    if (Number.isNaN(addBank) || addBank < 0) return "Bank amount cannot be negative.";
    if (Number.isNaN(addCash) || addCash < 0) return "Cash amount cannot be negative.";
    if (addBank === 0 && addCash === 0) return "Enter an amount to add.";
    if (addTotal > maxAddAllowed + 0.001) {
      return `Total cannot exceed ${formatPKR(maxAddAllowed)} remaining for this period.`;
    }
    return "";
  };

  const validateFix = () => {
    const bank = Number(fixForm.bank);
    const cash = Number(fixForm.cash);
    if (Number.isNaN(bank) || bank < 0) return "Bank amount cannot be negative.";
    if (Number.isNaN(cash) || cash < 0) return "Cash amount cannot be negative.";
    if (fixTotal > fixMaxAllowed + 0.001) {
      return `Total cannot exceed ${formatPKR(fixMaxAllowed)} for this subscription period.`;
    }
    return "";
  };

  const submitAdd = async () => {
    const err = validateAdd();
    if (err) {
      setAddError(err);
      return;
    }
    setAdding(true);
    setAddError("");
    try {
      await apiFetch(
        `/transactions/tenant/${contextRow.tenant_id}/payments`,
        {
          method: "POST",
          body: JSON.stringify({ bank: addBank, cash: addCash }),
        },
        authFetch
      );
      setAddForm({ bank: "", cash: "" });
      await loadTenantPayments(contextRow.tenant_id);
      await reload();
    } catch (e) {
      setAddError(e.message || "Failed to add transaction");
    } finally {
      setAdding(false);
    }
  };

  const submitFix = async () => {
    const err = validateFix();
    if (err) {
      setFixError(err);
      return;
    }
    setFixing(true);
    setFixError("");
    try {
      await apiFetch(
        `/transactions/payments/${fixPayment.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            bank: Number(fixForm.bank) || 0,
            cash: Number(fixForm.cash) || 0,
          }),
        },
        authFetch
      );
      closeFixModal();
      await loadTenantPayments(contextRow.tenant_id);
      await reload();
    } catch (e) {
      setFixError(e.message || "Failed to update payment");
    } finally {
      setFixing(false);
    }
  };

  const handleDelete = async () => {
    if (!deletePayment || !contextRow) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await apiFetch(`/transactions/payments/${deletePayment.id}`, { method: "DELETE" }, authFetch);
      setDeletePayment(null);
      await loadTenantPayments(contextRow.tenant_id);
      await reload();
    } catch (e) {
      setDeleteError(e.message || "Failed to delete payment");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "company_name", label: "Tenant" },
    { key: "plan_name", label: "Plan", format: (v) => v || "—" },
    { key: "billing_cycle", label: "Cycle" },
    {
      key: "elapsed_periods",
      label: "Periods",
      format: (_, r) => formatElapsedPeriods(r),
    },
    {
      key: "cycle_start",
      label: "Start Date",
      filterType: "date",
      format: (_, r) => formatDate(r.cycle_start || r.start_date),
    },
    {
      key: "end_date",
      label: "Period End",
      filterType: "date",
      format: (_, r) => formatDate(r.cycle_end || r.end_date),
    },
    {
      key: "total_billing_amount",
      label: "Total Billing",
      format: (_, r) => formatPKR(r.total_billing_amount ?? r.period_total),
    },
    {
      key: "total_received",
      label: "Total Received",
      format: (_, r) => formatPKR(r.total_received),
    },
    {
      key: "total_amount_due",
      label: "Total Due",
      format: (_, r) => formatPKR(r.total_amount_due ?? r.amount_due),
    },
    {
      key: "current_cycle_amount",
      label: "Cycle Amount",
      format: (_, r) => formatPKR(r.current_cycle_amount),
    },
    {
      key: "current_cycle_received",
      label: "Cycle Received",
      format: (_, r) => formatPKR(r.current_cycle_received),
    },
    {
      key: "current_cycle_due",
      label: "Cycle Due",
      format: (_, r) => formatPKR(r.current_cycle_due),
    },
  ];

  const meta = contextRow;

  return (
    <div className="wh-page">
      <PageHeader
        title="Transaction"
        description="Tenant billing overview — open a tenant to record or review payments."
      />
      {loadError && <div className="wh-alert wh-alert--error">{loadError}</div>}
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
      <Card className="wh-card--table">
        <div className="wh-card-table__head">
          <h3 className="wh-card__title">Tenants</h3>
        </div>
        {loading ? (
          <p className="wh-muted">Loading tenants…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="cycle_start"
              searchPlaceholder="Search tenants…"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={openAddModal}
              emptyMessage="No tenants yet."
            />
          </>
        )}
      </Card>

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        title={`Add Transaction — ${meta?.company_name || ""}`}
        className="wh-modal--transaction wh-modal--transaction-xl"
        footer={
          <>
            {addError && <p className="wh-field__error">{addError}</p>}
            <Button variant="secondary" onClick={closeAddModal}>Close</Button>
            <Button onClick={submitAdd} disabled={adding}>
              {adding ? "Saving…" : "Submit"}
            </Button>
          </>
        }
      >
        <div className="wh-tx-panel">
          <h4 className="wh-tx-panel__title">Previous (current state)</h4>
          <SummaryGrid
            items={[
              { label: "Tenant", value: meta?.company_name || "—" },
              { label: "Plan", value: meta?.plan_name || "—" },
              { label: "Billing cycle", value: meta?.billing_cycle || "—" },
              { label: "Billing periods", value: formatElapsedPeriods(meta) },
              { label: "Current period start", value: toInputDate(meta?.cycle_start || meta?.start_date) || "—" },
              { label: "Period end", value: toInputDate(meta?.cycle_end || meta?.end_date) || "—" },
              { label: "Total billing", value: formatPKR(periodTotal), accent: true },
              { label: "Total received", value: formatPKR(tenantPaidCurrent) },
              { label: "Total due", value: formatPKR(currentPending) },
              { label: "Current cycle amount", value: formatPKR(currentCycleAmount) },
              { label: "Current cycle received", value: formatPKR(currentCycleReceived) },
              { label: "Current cycle due", value: formatPKR(currentCycleDue) },
              { label: "Current bank", value: formatPKR(tenantBankCurrent) },
              { label: "Current cash", value: formatPKR(tenantCashCurrent) },
            ]}
          />
        </div>

        <div className="wh-tx-inputs">
          <div className="wh-form-grid">
            <FormField
              id="tx_add_bank"
              label="Add bank (Rs.)"
              type="number"
              step="0.01"
              min="0"
              value={addForm.bank}
              onChange={(e) => {
                setAddError("");
                setAddForm((f) => ({ ...f, bank: e.target.value }));
              }}
            />
            <FormField
              id="tx_add_cash"
              label="Add cash (Rs.)"
              type="number"
              step="0.01"
              min="0"
              value={addForm.cash}
              onChange={(e) => {
                setAddError("");
                setAddForm((f) => ({ ...f, cash: e.target.value }));
              }}
            />
          </div>
        </div>

        <div className="wh-tx-panel wh-tx-panel--summary">
          <SummaryGrid
            items={[
              { label: "New bank total", value: formatPKR(tenantBankCurrent + addBank) },
              { label: "New cash total", value: formatPKR(tenantCashCurrent + addCash) },
              { label: "New received total", value: formatPKR(newTenantPaid) },
              { label: "New pending", value: formatPKR(newPending), accent: true },
            ]}
          />
        </div>

        <div className="wh-tx-history">
          <h4 className="wh-tx-panel__title">Received payments</h4>
          {tenantPaymentsLoading ? (
            <p className="wh-muted">Loading payments…</p>
          ) : (
            <div className="wh-tx-payments-wrap">
              <table className="wh-tx-payments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bank</th>
                    <th>Cash</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!tenantPayments.length ? (
                    <tr>
                      <td colSpan={5} className="wh-table-empty">No payments for this tenant.</td>
                    </tr>
                  ) : (
                    tenantPayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.received_at ? formatDateTime(p.received_at) : "—"}</td>
                        <td>{formatPKR(p.bank)}</td>
                        <td>{formatPKR(p.cash)}</td>
                        <td>{formatPKR(p.total_received)}</td>
                        <td>
                          <div className="wh-action-btns">
                            <Button
                              variant="secondary"
                              className="wh-btn--sm"
                              onClick={() => openFixModal(p)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              className="wh-btn--sm"
                              onClick={() => setDeletePayment(p)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!fixPayment}
        onClose={closeFixModal}
        title="Edit Payment"
        className="wh-modal--transaction"
        footer={
          <>
            {fixError && <p className="wh-field__error">{fixError}</p>}
            <Button variant="secondary" onClick={closeFixModal}>Cancel</Button>
            <Button onClick={submitFix} disabled={fixing}>
              {fixing ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <p className="wh-modal__text">
          Correct the bank and cash amounts for this payment entry.
          {fixPayment?.received_at && (
            <> Recorded on {formatDateTime(fixPayment.received_at)}.</>
          )}
        </p>
        <div className="wh-form-grid">
          <FormField
            id="tx_fix_bank"
            label="Bank (Rs.)"
            type="number"
            step="0.01"
            min="0"
            value={fixForm.bank}
            onChange={(e) => {
              setFixError("");
              setFixForm((f) => ({ ...f, bank: e.target.value }));
            }}
          />
          <FormField
            id="tx_fix_cash"
            label="Cash (Rs.)"
            type="number"
            step="0.01"
            min="0"
            value={fixForm.cash}
            onChange={(e) => {
              setFixError("");
              setFixForm((f) => ({ ...f, cash: e.target.value }));
            }}
          />
          <FormField id="tx_fix_total" label="Total (Rs.)" value={formatPKR(fixTotal)} readOnly />
        </div>
      </Modal>

      <ConfirmDeleteModal
        open={!!deletePayment}
        onClose={() => {
          setDeletePayment(null);
          setDeleteError("");
        }}
        title="Delete payment"
        categoryLabel="payment"
        cascadeItems={[
          "The tenant's total received, amount due, and current cycle balances will be recalculated",
        ]}
        recordName={`payment on ${deletePayment?.received_at ? formatDateTime(deletePayment.received_at) : "this date"}`}
        confirmPhrase="DELETE"
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
