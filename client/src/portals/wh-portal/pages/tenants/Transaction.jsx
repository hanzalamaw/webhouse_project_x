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

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "start_date" }),
    [rows, toolbar]
  );

  const periodTotal = contextRow?.period_total ?? 0;
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
    await Promise.all([loadSummary(), loadTenants()]);
  }, [loadSummary, loadTenants]);

  useEffect(() => {
    setLoading(true);
    reload().catch(() => {}).finally(() => setLoading(false));
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
    { key: "start_date", label: "Start Date", filterType: "date", format: formatDate },
    { key: "end_date", label: "End Date", filterType: "date", format: formatDate },
    { key: "period_total", label: "Period Total", format: (_, r) => formatPKR(r.period_total) },
    { key: "total_received", label: "Received", format: (_, r) => formatPKR(r.total_received) },
    { key: "amount_due", label: "Due", format: (_, r) => formatPKR(r.amount_due) },
    { key: "bank", label: "Bank", format: (_, r) => formatPKR(r.bank) },
    { key: "cash", label: "Cash", format: (_, r) => formatPKR(r.cash) },
  ];

  const meta = contextRow;

  return (
    <div className="wh-page">
      <PageHeader
        title="Transaction"
        description="Tenant billing overview — open a tenant to record or review payments."
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
              dateField="start_date"
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
              { label: "Start date", value: toInputDate(meta?.start_date) || "—" },
              { label: "End date", value: toInputDate(meta?.end_date) || "—" },
              { label: "Period total", value: formatPKR(periodTotal), accent: true },
              { label: "Current bank", value: formatPKR(tenantBankCurrent) },
              { label: "Current cash", value: formatPKR(tenantCashCurrent) },
              { label: "Current received", value: formatPKR(tenantPaidCurrent) },
              { label: "Current pending", value: formatPKR(currentPending) },
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
                    <th>ID</th>
                    <th>Bank</th>
                    <th>Cash</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!tenantPayments.length ? (
                    <tr>
                      <td colSpan={6} className="wh-table-empty">No payments for this tenant.</td>
                    </tr>
                  ) : (
                    tenantPayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.received_at ? formatDateTime(p.received_at) : "—"}</td>
                        <td>{p.id}</td>
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
        title={`Edit Payment #${fixPayment?.id || ""}`}
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
        recordName={`payment #${deletePayment?.id || ""}`}
        confirmPhrase="DELETE"
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
