import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { useMoney } from "../../../../../../hooks/useMoney";
import { apiFetch, fetchAllTableRows, TABLE_PAGE_SIZE } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { StatCard } from "../../../../../../components/StatCard";
import { DataTable } from "../../../../../../components/DataTable";
import { TableToolbar } from "../../../../../../components/TableToolbar";
import { FormField } from "../../../../../../components/FormField";
import { Button } from "../../../../../../components/Button";
import { Modal } from "../../../../../../components/Modal";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { PaymentAmountField } from "../../../../../../components/PaymentAmountField";
import { PaymentAmountFeedback } from "../../../../../../components/PaymentAmountFeedback";
import { PaymentViaSelect } from "../../../../../../components/PaymentViaSelect";
import { StatusBadge } from "../../../../../../components/Badge";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../../../utils/dateTime";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";
import { encodePaymentVia, parsePaymentVia } from "../../../../../../utils/paymentVia";
import { PAYMENT_METHOD_LABELS } from "../../constants";

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

function paymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method || "—";
}

const EMPTY_PAYMENT_FORM = { amount: "", payment_via: "cash" };

function paymentPayload(form, amount) {
  const { payment_method, bank_account_id } = parsePaymentVia(form.payment_via);
  return {
    amount,
    payment_method,
    payment_status: "paid",
    bank_account_id,
  };
}

function canSubmitAmount(amount, maxAllowed) {
  const amt = Number(amount) || 0;
  return amt > 0 && amt <= maxAllowed + 0.001;
}

export default function ManagePayments() {
  const { authFetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingOrderIdRef = useRef(location.state?.openOrderId);
  const { canCreate, canEdit, canDelete } = useModulePermission("order-management");
  const { amountLabel } = useMoney();
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [orderPayments, setOrderPayments] = useState([]);
  const [orderPaymentsLoading, setOrderPaymentsLoading] = useState(false);
  const [contextRow, setContextRow] = useState(null);
  const [addForm, setAddForm] = useState(EMPTY_PAYMENT_FORM);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [fixPayment, setFixPayment] = useState(null);
  const [fixForm, setFixForm] = useState(EMPTY_PAYMENT_FORM);
  const [fixError, setFixError] = useState("");
  const [fixing, setFixing] = useState(false);
  const [deletePayment, setDeletePayment] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [toolbar, setToolbar] = useState({ ...EMPTY_TOOLBAR });
  const [loadError, setLoadError] = useState("");

  const filteredRows = useMemo(
    () => applyToolbarFilters(rows, toolbar, { dateField: "created_at" }),
    [rows, toolbar]
  );

  const orderTotal = Number(contextRow?.payable_amount) || 0;
  const orderPaidCurrent = useMemo(() => sumField(orderPayments, "amount"), [orderPayments]);
  const currentPending = Math.max(0, Number((orderTotal - orderPaidCurrent).toFixed(2)));

  const addAmount = Number(addForm.amount) || 0;
  const newOrderPaid = orderPaidCurrent + addAmount;
  const newPending = Math.max(0, Number((orderTotal - newOrderPaid).toFixed(2)));
  const maxAddAllowed = Math.max(0, Number((orderTotal - orderPaidCurrent).toFixed(2)));

  const fixOtherPaid = useMemo(() => {
    if (!fixPayment) return 0;
    return orderPayments
      .filter((p) => p.id !== fixPayment.id)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [orderPayments, fixPayment]);

  const fixAmount = Number(fixForm.amount) || 0;
  const fixMaxAllowed = Math.max(0, Number((orderTotal - fixOtherPaid).toFixed(2)));
  const fixNewPaid = fixOtherPaid + fixAmount;
  const fixNewPending = Math.max(0, Number((orderTotal - fixNewPaid).toFixed(2)));

  useEffect(() => {
    setPage(1);
  }, [toolbar]);

  const loadSummary = useCallback(async () => {
    const data = await apiFetch("/orders/payments/summary", {}, authFetch);
    setSummary(data);
  }, [authFetch]);

  const loadOrders = useCallback(async () => {
    const data = await fetchAllTableRows("/orders/payments/transactions", authFetch);
    setRows(data);
  }, [authFetch]);

  const loadOrderPayments = useCallback(
    async (orderId) => {
      setOrderPaymentsLoading(true);
      try {
        const res = await apiFetch(`/orders/payments/order/${orderId}`, {}, authFetch);
        setOrderPayments(res.data || []);
      } catch {
        setOrderPayments([]);
      } finally {
        setOrderPaymentsLoading(false);
      }
    },
    [authFetch]
  );

  const reload = useCallback(async () => {
    setLoadError("");
    try {
      await Promise.all([loadSummary(), loadOrders()]);
    } catch (err) {
      setLoadError(err.message || "Failed to load payments");
      setRows([]);
    }
  }, [loadSummary, loadOrders]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const openAddModal = async (row) => {
    setContextRow(row);
    setAddModalOpen(true);
    setAddForm(EMPTY_PAYMENT_FORM);
    setAddError("");
    await loadOrderPayments(row.order_id);
  };

  useEffect(() => {
    const orderId = pendingOrderIdRef.current;
    if (!orderId || loading || !rows.length) return;
    const row = rows.find((r) => Number(r.order_id) === Number(orderId));
    if (!row) return;
    pendingOrderIdRef.current = null;
    navigate(location.pathname, { replace: true, state: {} });
    openAddModal(row).catch(() => {});
  }, [loading, rows, location.pathname, navigate]);

  const closeAddModal = () => {
    setAddModalOpen(false);
    setContextRow(null);
    setOrderPayments([]);
    setAddForm(EMPTY_PAYMENT_FORM);
    setAddError("");
  };

  const openFixModal = (payment) => {
    setFixPayment(payment);
    setFixForm({
      amount: String(payment.amount ?? 0),
      payment_via: encodePaymentVia({
        payment_method: payment.payment_method,
        bank_account_id: payment.bank_account_id,
      }),
    });
    setFixError("");
  };

  const closeFixModal = () => {
    setFixPayment(null);
    setFixForm(EMPTY_PAYMENT_FORM);
    setFixError("");
  };

  const submitAdd = async () => {
    if (!canSubmitAmount(addAmount, maxAddAllowed) || !canCreate) return;
    setAdding(true);
    setAddError("");
    try {
      await apiFetch(
        "/orders/payments",
        {
          method: "POST",
          body: JSON.stringify({
            order_id: contextRow.order_id,
            ...paymentPayload(addForm, addAmount),
          }),
        },
        authFetch
      );
      setAddForm(EMPTY_PAYMENT_FORM);
      await loadOrderPayments(contextRow.order_id);
      await reload();
    } catch (e) {
      setAddError(e.message || "Failed to add payment");
    } finally {
      setAdding(false);
    }
  };

  const submitFix = async () => {
    if (!canSubmitAmount(fixAmount, fixMaxAllowed) || !canEdit) return;
    setFixing(true);
    setFixError("");
    try {
      await apiFetch(
        `/orders/payments/${fixPayment.id}`,
        {
          method: "PUT",
          body: JSON.stringify(paymentPayload(fixForm, fixAmount)),
        },
        authFetch
      );
      closeFixModal();
      await loadOrderPayments(contextRow.order_id);
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
      await apiFetch(`/orders/payments/${deletePayment.id}`, { method: "DELETE" }, authFetch);
      setDeletePayment(null);
      await loadOrderPayments(contextRow.order_id);
      await reload();
    } catch (e) {
      setDeleteError(e.message || "Failed to delete payment");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: "order_no", label: "Order #" },
    { key: "customer_name", label: "Customer", format: (v) => v || "—" },
    { key: "order_status", label: "Order Status", render: (r) => <StatusBadge status={r.order_status} /> },
    {
      key: "created_at",
      label: "Order Date",
      format: (v) => formatDate(v),
    },
    { key: "payable_amount", label: "Order Total", format: (v) => formatPKR(v) },
    { key: "total_received", label: "Total Received", format: (v) => formatPKR(v) },
    { key: "amount_due", label: "Amount Due", format: (v) => formatPKR(v) },
    { key: "payment_status", label: "Payment Status", render: (r) => <StatusBadge status={r.payment_status} /> },
  ];

  const meta = contextRow;

  return (
    <div className="wh-page">
      <PageHeader
        title="Payments"
        description="Order payment overview — open an order to record or review payments."
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
          <h3 className="wh-card__title">Orders</h3>
        </div>
        {loading ? (
          <p className="wh-muted">Loading orders…</p>
        ) : (
          <>
            <TableToolbar
              rows={rows}
              value={toolbar}
              onChange={setToolbar}
              dateField="created_at"
              searchPlaceholder="Search orders…"
              layout="stacked"
            />
            <DataTable
              columns={columns}
              rows={filteredRows}
              filterRows={filteredRows}
              page={page}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setPage}
              onRowClick={openAddModal}
              emptyMessage="No orders yet."
            />
          </>
        )}
      </Card>

      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        title={`Open Payment — ${meta?.order_no || ""}`}
        className="wh-modal--transaction wh-modal--transaction-xl"
        footer={
          <>
            {addError && <p className="wh-field__error">{addError}</p>}
            <Button variant="secondary" onClick={closeAddModal}>Close</Button>
            <Button onClick={submitAdd} disabled={adding || !canCreate || !canSubmitAmount(addAmount, maxAddAllowed)}>
              {adding ? "Saving…" : "Submit"}
            </Button>
          </>
        }
      >
        <div className="wh-tx-panel">
          <h4 className="wh-tx-panel__title">Previous (current state)</h4>
          <SummaryGrid
            items={[
              { label: "Order #", value: meta?.order_no || "—" },
              { label: "Customer", value: meta?.customer_name || "—" },
              { label: "Order status", value: meta?.order_status || "—" },
              { label: "Payment status", value: meta?.payment_status || "—" },
              { label: "Order total", value: formatPKR(orderTotal), accent: true },
              { label: "Total received", value: formatPKR(orderPaidCurrent) },
              { label: "Amount due", value: formatPKR(currentPending) },
            ]}
          />
        </div>

        <div className="wh-tx-inputs">
          <div className="wh-form-grid wh-form-grid--2">
            <PaymentAmountField
              id="om_tx_add_amount"
              label={amountLabel("Amount")}
              value={addForm.amount}
              onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
              amount={addAmount}
              maxAllowed={maxAddAllowed}
              totalAfter={newOrderPaid}
              totalTarget={orderTotal}
              showZeroHint
              inlineFeedback={false}
            />
            <PaymentViaSelect
              authFetch={authFetch}
              id="om_tx_add_method"
              value={addForm.payment_via}
              onChange={(e) => setAddForm((f) => ({ ...f, payment_via: e.target.value }))}
            />
          </div>
          <PaymentAmountFeedback
            amount={addAmount}
            maxAllowed={maxAddAllowed}
            totalAfter={newOrderPaid}
            totalTarget={orderTotal}
            showZeroHint
            value={addForm.amount}
          />
        </div>

        <div className="wh-tx-panel wh-tx-panel--summary">
          <SummaryGrid
            items={[
              { label: "New received total", value: formatPKR(newOrderPaid) },
              { label: "New pending", value: formatPKR(newPending), accent: true },
            ]}
          />
        </div>

        <div className="wh-tx-history">
          <h4 className="wh-tx-panel__title">Received payments</h4>
          {orderPaymentsLoading ? (
            <p className="wh-muted">Loading payments…</p>
          ) : (
            <div className="wh-tx-payments-wrap">
              <table className="wh-tx-payments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!orderPayments.length ? (
                    <tr>
                      <td colSpan={4} className="wh-table-empty">No payments for this order.</td>
                    </tr>
                  ) : (
                    orderPayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.paid_at ? formatDateTime(p.paid_at) : "—"}</td>
                        <td>{paymentMethodLabel(p.payment_method)}</td>
                        <td>{formatPKR(p.amount)}</td>
                        <td>
                          <div className="wh-action-btns">
                            {canEdit && (
                              <Button variant="secondary" className="wh-btn--sm" onClick={() => openFixModal(p)}>
                                Edit
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="danger" className="wh-btn--sm" onClick={() => setDeletePayment(p)}>
                                Delete
                              </Button>
                            )}
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
            <Button onClick={submitFix} disabled={fixing || !canEdit || !canSubmitAmount(fixAmount, fixMaxAllowed)}>
              {fixing ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <p className="wh-modal__text">
          Update the amount and whether this payment was received via bank or cash.
          {fixPayment?.paid_at && (
            <> Recorded on {formatDateTime(fixPayment.paid_at)}.</>
          )}
        </p>
        <div className="wh-tx-inputs">
          <div className="wh-form-grid wh-form-grid--2">
            <PaymentAmountField
              id="om_tx_fix_amount"
              label={amountLabel("Amount")}
              value={fixForm.amount}
              onChange={(e) => setFixForm((f) => ({ ...f, amount: e.target.value }))}
              amount={fixAmount}
              maxAllowed={fixMaxAllowed}
              totalAfter={fixNewPaid}
              totalTarget={orderTotal}
              showZeroHint
              inlineFeedback={false}
            />
            <PaymentViaSelect
              authFetch={authFetch}
              id="om_tx_fix_method"
              value={fixForm.payment_via}
              onChange={(e) => setFixForm((f) => ({ ...f, payment_via: e.target.value }))}
            />
          </div>
          <PaymentAmountFeedback
            amount={fixAmount}
            maxAllowed={fixMaxAllowed}
            totalAfter={fixNewPaid}
            totalTarget={orderTotal}
            showZeroHint
            value={fixForm.amount}
          />
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
          "The order payment status and amount due will be recalculated",
        ]}
        recordName={`payment on ${deletePayment?.paid_at ? formatDateTime(deletePayment.paid_at) : "this date"}`}
        confirmPhrase="DELETE"
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </div>
  );
}
