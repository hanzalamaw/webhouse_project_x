import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../hooks/useModulePermission";
import { useMoney } from "../../../../../hooks/useMoney";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { FormBlock } from "../../../../../components/FormBlock";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { PaymentAmountField } from "../../../../../components/PaymentAmountField";
import { PaymentAmountFeedback } from "../../../../../components/PaymentAmountFeedback";
import { PaymentViaSelect } from "../../../../../components/PaymentViaSelect";
import { RecordViewSummary, DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatPKR } from "../../../../../utils/currency";
import { formatDate, formatDateTime } from "../../../../../utils/dateTime";
import { parsePaymentVia } from "../../../../../utils/paymentVia";
import { MODULE_BASE } from "../constants";

const EMPTY_FORM = { amount_paid: "", payment_via: "cash" };

function canSubmitAmount(amount, maxAllowed) {
  const amt = Number(amount) || 0;
  return amt > 0 && amt <= maxAllowed + 0.001;
}

export default function ViewVendorBill() {
  const { billId } = useParams();
  const { authFetch } = useAuth();
  const { canCreate, canEdit } = useModulePermission("finance");
  const { amountLabel } = useMoney();
  const navigate = useNavigate();
  const [bill, setBill] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const loadBill = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBill(await apiFetch(`/finance/vendor-bills/${billId}`, {}, authFetch));
    } catch (e) {
      setBill(null);
      setError(e.message || "Bill not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, billId]);

  const loadPayments = useCallback(async () => {
    setPaymentsLoading(true);
    try {
      const res = await apiFetch(`/finance/vendor-bills/${billId}/payments`, {}, authFetch);
      setPayments(res.data || []);
    } catch {
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  }, [authFetch, billId]);

  useEffect(() => {
    loadBill().catch(() => {});
    loadPayments().catch(() => {});
  }, [loadBill, loadPayments]);

  const billAmount = Number(bill?.bill_amount) || 0;
  const totalPaid = Number(bill?.total_paid) || 0;
  const amountDue = Number(bill?.amount_due) || 0;
  const addAmount = Number(addForm.amount_paid) || 0;
  const maxPay = Math.max(0, amountDue);
  const newTotalPaid = totalPaid + addAmount;

  const submitPayment = async () => {
    if (!bill || !canSubmitAmount(addAmount, maxPay) || !canCreate) return;
    const { payment_method, bank_account_id } = parsePaymentVia(addForm.payment_via);
    setAdding(true);
    setAddError("");
    try {
      await apiFetch(`/finance/vendor-bills/${billId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount_paid: addAmount, payment_method, bank_account_id }),
      }, authFetch);
      await loadBill();
      await loadPayments();
      setAddForm(EMPTY_FORM);
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Bill not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/vendor-bills`)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={`Vendor bill — ${bill.bill_no}`}
          description="Bill details and payment history."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/vendor-bills`)}>All bills</Button>
              {canEdit && <Button onClick={() => navigate(`${MODULE_BASE}/vendor-bills/edit/${billId}`)}>Edit bill</Button>}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={bill.vendor_name}
            subtitle={`Bill #${bill.bill_no}`}
            status={bill.status}
            chips={[
              { label: "Bill amount", value: formatPKR(billAmount) },
              { label: "Amount due", value: formatPKR(amountDue) },
              { label: "Due date", value: formatDate(bill.due_date) },
            ]}
          />

          <FormBlock title="Bill summary">
            <DetailGrid>
              <DetailValue label="Vendor" highlight>{bill.vendor_name}</DetailValue>
              <DetailValue label="Bill #">{bill.bill_no}</DetailValue>
              <DetailValue label="Bill amount" highlight>{formatPKR(billAmount)}</DetailValue>
              <DetailValue label="Paid">{formatPKR(totalPaid)}</DetailValue>
              <DetailValue label="Amount due" highlight>{formatPKR(amountDue)}</DetailValue>
              <DetailValue label="Due date">{formatDate(bill.due_date)}</DetailValue>
              <DetailValue label="Status"><StatusBadge status={bill.status} /></DetailValue>
            </DetailGrid>
          </FormBlock>

          {amountDue > 0 && (
            <FormBlock title="Record payment" description="Add a payment against this bill.">
              {addError && <div className="wh-alert wh-alert--error">{addError}</div>}
              <div className="wh-tx-inputs">
                <div className="wh-form-grid wh-form-grid--2">
                  <PaymentAmountField
                    id="vb_view_amount"
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
                    id="vb_view_method"
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
              <Button
                onClick={submitPayment}
                disabled={adding || !canCreate || !canSubmitAmount(addAmount, maxPay)}
              >
                {adding ? "Saving…" : "Record payment"}
              </Button>
            </FormBlock>
          )}

          <FormBlock title="Payment history">
            {paymentsLoading ? (
              <p className="wh-muted">Loading payments…</p>
            ) : payments.length === 0 ? (
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
          </FormBlock>
        </div>
      </FormPageLayout>
    </div>
  );
}
