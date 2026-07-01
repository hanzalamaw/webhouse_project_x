import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
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
import { StatusBadge } from "../../../../../../components/Badge";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../../../utils/dateTime";
import { addPaymentReceived } from "../../../../../../utils/billing";
import { applyToolbarFilters, EMPTY_TOOLBAR } from "../../../../../../utils/tableFilters";

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

export default function ManagePayments() {
  const { authFetch } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermission("order-management");
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [orderPayments, setOrderPayments] = useState([]);
  const [orderPaymentsLoading, setOrderPaymentsLoading] = useState(false);
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
    () => applyToolbarFilters(rows, toolbar, { dateField: "created_at" }),
    [rows, toolbar]
  );

  const orderTotal = Number(contextRow?.payable_amount) || 0;
  const orderPaidCurrent = useMemo(() => sumField(orderPayments, "amount"), [orderPayments]);
  const orderBankCurrent = useMemo(() => sumField(orderPayments, "bank"), [orderPayments]);
  const orderCashCurrent = useMemo(() => sumField(orderPayments, "cash"), [orderPayments]);
  const currentPending = Math.max(0, Number((orderTotal - orderPaidCurrent).toFixed(2)));

  const addBank = Number(addForm.bank) || 0;
  const addCash = Number(addForm.cash) || 0;
  const addTotal = addPaymentReceived(addForm.bank, addForm.cash);
  const newOrderPaid = orderPaidCurrent + addTotal;
  const newPending = Math.max(0, Number((orderTotal - newOrderPaid).toFixed(2)));
  const maxAddAllowed = Math.max(0, Number((orderTotal - orderPaidCurrent).toFixed(2)));

  const fixOtherPaid = useMemo(() => {
    if (!fixPayment) return 0;
    return orderPayments
      .filter((p) => p.id !== fixPayment.id)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [orderPayments, fixPayment]);

  const fixTotal = addPaymentReceived(fixForm.bank, fixForm.cash);
  const fixMaxAllowed = Math.max(0, Number((orderTotal - fixOtherPaid).toFixed(2)));

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
    setAddForm({ bank: "", cash: "" });
    setAddError("");
    await loadOrderPayments(row.order_id);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setContextRow(null);
    setOrderPayments([]);
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
      return `Total cannot exceed ${formatPKR(maxAddAllowed)} remaining for this order.`;
    }
    return "";
  };

  const validateFix = () => {
    const bank = Number(fixForm.bank);
    const cash = Number(fixForm.cash);
    if (Number.isNaN(bank) || bank < 0) return "Bank amount cannot be negative.";
    if (Number.isNaN(cash) || cash < 0) return "Cash amount cannot be negative.";
    if (fixTotal > fixMaxAllowed + 0.001) {
      return `Total cannot exceed ${formatPKR(fixMaxAllowed)} for this order.`;
    }
    return "";
  };

  const submitAdd = async () => {
    const err = validateAdd();
    if (err) {
      setAddError(err);
      return;
    }
    if (!canCreate) return;
    setAdding(true);
    setAddError("");
    try {
      await apiFetch(
        "/orders/payments",
        {
          method: "POST",
          body: JSON.stringify({
            order_id: contextRow.order_id,
            bank: addBank,
            cash: addCash,
            payment_status: "paid",
          }),
        },
        authFetch
      );
      setAddForm({ bank: "", cash: "" });
      await loadOrderPayments(contextRow.order_id);
      await reload();
    } catch (e) {
      setAddError(e.message || "Failed to add payment");
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
    if (!canEdit) return;
    setFixing(true);
    setFixError("");
    try {
      await apiFetch(
        `/orders/payments/${fixPayment.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            bank: Number(fixForm.bank) || 0,
            cash: Number(fixForm.cash) || 0,
            payment_status: "paid",
          }),
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
    {
      label: "Actions",
      filter: false,
      stopRowClick: true,
      render: (row) => (
        <Button variant="secondary" className="wh-btn--sm" onClick={() => openAddModal(row)}>
          Open Payment
        </Button>
      ),
    },
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
            <Button onClick={submitAdd} disabled={adding || !canCreate}>
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
              { label: "Current bank", value: formatPKR(orderBankCurrent) },
              { label: "Current cash", value: formatPKR(orderCashCurrent) },
            ]}
          />
        </div>

        <div className="wh-tx-inputs">
          <div className="wh-form-grid">
            <FormField
              id="om_tx_add_bank"
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
              id="om_tx_add_cash"
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
              { label: "New bank total", value: formatPKR(orderBankCurrent + addBank) },
              { label: "New cash total", value: formatPKR(orderCashCurrent + addCash) },
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
                    <th>Bank</th>
                    <th>Cash</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!orderPayments.length ? (
                    <tr>
                      <td colSpan={5} className="wh-table-empty">No payments for this order.</td>
                    </tr>
                  ) : (
                    orderPayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.paid_at ? formatDateTime(p.paid_at) : "—"}</td>
                        <td>{formatPKR(p.bank)}</td>
                        <td>{formatPKR(p.cash)}</td>
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
            <Button onClick={submitFix} disabled={fixing || !canEdit}>
              {fixing ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <p className="wh-modal__text">
          Correct the bank and cash amounts for this payment entry.
          {fixPayment?.paid_at && (
            <> Recorded on {formatDateTime(fixPayment.paid_at)}.</>
          )}
        </p>
        <div className="wh-form-grid">
          <FormField
            id="om_tx_fix_bank"
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
            id="om_tx_fix_cash"
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
          <FormField id="om_tx_fix_total" label="Total (Rs.)" value={formatPKR(fixTotal)} readOnly />
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
