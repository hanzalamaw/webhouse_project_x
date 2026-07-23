import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { useMoney } from "../../../../../hooks/useMoney";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { Card } from "../../../../../components/Card";
import { DataTable } from "../../../../../components/DataTable";
import { TableToolbar } from "../../../../../components/TableToolbar";
import { Modal } from "../../../../../components/Modal";
import { Button } from "../../../../../components/Button";
import { PaymentAmountField } from "../../../../../components/PaymentAmountField";
import { PaymentAmountFeedback } from "../../../../../components/PaymentAmountFeedback";
import { PaymentViaSelect } from "../../../../../components/PaymentViaSelect";
import { StatusBadge } from "../../../../../components/Badge";
import { EMPTY_TOOLBAR } from "../../../../../utils/tableFilters";
import { useToolbarFilteredRows } from "../../../../../hooks/useToolbarFilteredRows";
import { formatPKR } from "../../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../../utils/dateTime";
import { parsePaymentVia } from "../../../../../utils/paymentVia";
import { MODULE_BASE, VENDOR_BILL_STATUSES } from "../constants";

function SummaryGrid({ items }) {
  return (
    <div className="wh-tx-summary-grid">
      {items.map(({ label, value, accent }) => (
        <div key={label} className="wh-tx-summary-item">
          <span className="wh-tx-summary-item__label">{label}</span>
          <span className={`wh-tx-summary-item__value${accent ? " wh-tx-summary-item__value--accent" : ""}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

const TOOLBAR_FILTERS = [
  { key: "vendor_name", label: "Vendor" },
  { key: "bill_no", label: "Bill #" },
  { key: "status", label: "Status", options: VENDOR_BILL_STATUSES },
];

const EMPTY_FORM = { amount_paid: "", payment_via: "cash" };

function canSubmitAmount(amount, maxAllowed) {
  const amt = Number(amount) || 0;
  return amt > 0 && amt <= maxAllowed + 0.001;
}

export default function VendorBills() {
  const { authFetch } = useAuth();
  const { canCreate } = useModulePermission("finance");
  const { amountLabel } = useMoney();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR, status: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [contextRow, setContextRow] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const filteredRows = useToolbarFilteredRows(rows, toolbar, {
    dateField: "due_date",
    filters: TOOLBAR_FILTERS,
  });

  const billAmount = Number(contextRow?.bill_amount) || 0;
  const totalPaid = Number(contextRow?.total_paid) || 0;
  const amountDue = Number(contextRow?.amount_due) || 0;
  const addAmount = Number(addForm.amount_paid) || 0;
  const maxPay = Math.max(0, amountDue);
  const newTotalPaid = totalPaid + addAmount;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchAllTableRows("/finance/vendor-bills", authFetch));
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const loadPayments = useCallback(async (billId) => {
    setPaymentsLoading(true);
    try {
      const res = await apiFetch(`/finance/vendor-bills/${billId}/payments`, {}, authFetch);
      setPayments(res.data || []);
    } catch {
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { setPage(1); }, [toolbar]);

  const openPaymentModal = async (row) => {
    setContextRow(row);
    setModalOpen(true);
    setAddForm(EMPTY_FORM);
    setAddError("");
    await loadPayments(row.id);
  };

  const closeModal = () => {
    setModalOpen(false);
    setContextRow(null);
    setPayments([]);
  };

  const submitPayment = async () => {
    if (!contextRow || !canSubmitAmount(addAmount, maxPay) || !canCreate) return;
    const { payment_method, bank_account_id } = parsePaymentVia(addForm.payment_via);
    setAdding(true);
    setAddError("");
    try {
      await apiFetch(`/finance/vendor-bills/${contextRow.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount_paid: addAmount, payment_method, bank_account_id }),
      }, authFetch);
      await load();
      const updated = (await fetchAllTableRows("/finance/vendor-bills", authFetch)).find((r) => r.id === contextRow.id);
      if (updated) setContextRow(updated);
      await loadPayments(contextRow.id);
      setAddForm(EMPTY_FORM);
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const columns = [
    { key: "vendor_name", label: "Vendor" },
    { key: "bill_no", label: "Bill #" },
    { key: "bill_amount", label: "Amount", format: (v) => formatPKR(v) },
    { key: "amount_due", label: "Due", format: (v) => formatPKR(v) },
    { key: "due_date", label: "Due date", format: formatDate },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <div className="wh-action-btns">
          {Number(row.amount_due) > 0 && (
            <Button className="wh-btn--sm" disabled={!canCreate} onClick={() => openPaymentModal(row)}>
              Record payment
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="wh-page">
      <PageHeader
        title="Vendor Bills & Payments"
        description="Supplier bills and payment tracking."
        actions={<Button onClick={() => navigate(`${MODULE_BASE}/vendor-bills/create`)} disabled={!canCreate}>Add bill</Button>}
      />
      {error && <div className="wh-alert wh-alert--error">{error}</div>}
      <Card className="wh-card--table">
        {loading ? <p className="wh-muted">Loading…</p> : (
          <>
            <TableToolbar rows={rows} value={toolbar} onChange={setToolbar} dateField="due_date" filters={TOOLBAR_FILTERS} searchPlaceholder="Search bills…" layout="stacked" />
            <DataTable
              columns={columns}
              rows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={(row) => navigate(`${MODULE_BASE}/vendor-bills/view/${row.id}`)}
            />
          </>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={contextRow ? `Vendor bill — ${contextRow.bill_no}` : "Vendor bill"}
        className="wh-modal--transaction wh-modal--transaction-xl"
        footer={
          <>
            {addError && <p className="wh-field__error">{addError}</p>}
            <Button variant="secondary" onClick={closeModal}>Close</Button>
            {amountDue > 0 && (
              <Button onClick={submitPayment} disabled={adding || !canCreate || !canSubmitAmount(addAmount, maxPay)}>
                {adding ? "Saving…" : "Record payment"}
              </Button>
            )}
          </>
        }
      >
        {contextRow && (
          <>
            <div className="wh-tx-panel">
              <h4 className="wh-tx-panel__title">Bill summary</h4>
              <SummaryGrid items={[
                { label: "Vendor", value: contextRow.vendor_name },
                { label: "Bill #", value: contextRow.bill_no },
                { label: "Bill amount", value: formatPKR(billAmount), accent: true },
                { label: "Paid", value: formatPKR(totalPaid) },
                { label: "Amount due", value: formatPKR(amountDue) },
                { label: "Due date", value: formatDate(contextRow.due_date) },
                { label: "Status", value: contextRow.status },
              ]} />
            </div>

            {amountDue > 0 && (
              <div className="wh-tx-inputs">
                <div className="wh-form-grid wh-form-grid--2">
                  <PaymentAmountField
                    id="vb_amount"
                    label={amountLabel("Payment amount")}
                    value={addForm.amount_paid}
                    onChange={(e) => setAddForm((f) => ({ ...f, amount_paid: e.target.value }))}
                    amount={addAmount}
                    maxAllowed={maxPay}
                    totalAfter={newTotalPaid}
                    totalTarget={billAmount}
                    showZeroHint
                    inlineFeedback={false}
                  />
                  <PaymentViaSelect
                    authFetch={authFetch}
                    id="vb_method"
                    value={addForm.payment_via}
                    onChange={(e) => setAddForm((f) => ({ ...f, payment_via: e.target.value }))}
                  />
                </div>
                <PaymentAmountFeedback
                  amount={addAmount}
                  maxAllowed={maxPay}
                  totalAfter={newTotalPaid}
                  totalTarget={billAmount}
                  showZeroHint
                  value={addForm.amount_paid}
                />
              </div>
            )}

            <div className="wh-tx-panel">
              <h4 className="wh-tx-panel__title">Payment history</h4>
              {paymentsLoading ? <p className="wh-muted">Loading…</p> : payments.length === 0 ? (
                <p className="wh-muted">No payments recorded yet.</p>
              ) : (
                <ul className="wh-tx-payment-list">
                  {payments.map((p) => (
                    <li key={p.id} className="wh-tx-payment-row">
                      <span>{formatDateTime(p.paid_at)}</span>
                      <span>{p.bank_name ? `${p.bank_name} (${p.account_number})` : "Cash"}</span>
                      <strong>{formatPKR(p.amount_paid)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
