import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { FormBlock } from "../../../../../components/FormBlock";
import { Button } from "../../../../../components/Button";
import { RecordViewSummary, DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import {
  MODULE_BASE,
  TRANSACTION_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  CUSTOMER_PAYMENT_SOURCE_LABELS,
  labelFor,
} from "../constants";

export default function ViewTransaction() {
  const { transactionId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTransaction(await apiFetch(`/finance/transactions/${encodeURIComponent(transactionId)}`, {}, authFetch));
    } catch (e) {
      setTransaction(null);
      setError(e.message || "Transaction not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, transactionId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Transaction not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/transactions`)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  const typeLabel = labelFor(TRANSACTION_TYPE_LABELS, transaction.transaction_type);

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Transaction"
          description="Financial transaction record."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/transactions`)}>All transactions</Button>
              {transaction.order_id && (
                <Button variant="secondary" onClick={() => navigate(`/app/m/order-management/orders/view/${transaction.order_id}`)}>View order</Button>
              )}
              {transaction.transaction_type === "customer_payment" && transaction.order_id && (
                <Button onClick={() => navigate("/app/m/order-management/payments/manage", { state: { openOrderId: transaction.order_id } })}>
                  Record payment
                </Button>
              )}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={formatPKR(transaction.amount)}
            subtitle={typeLabel}
            chips={[
              { label: "Reference", value: transaction.reference || "—" },
              { label: "When", value: transaction.transaction_at ? formatDateTime(transaction.transaction_at) : "—" },
            ]}
          />

          <FormBlock title="Transaction details">
            <DetailGrid>
              <DetailValue label="Type">{typeLabel}</DetailValue>
              <DetailValue label="Amount" highlight>{formatPKR(transaction.amount)}</DetailValue>
              <DetailValue label="Method">{labelFor(PAYMENT_METHOD_LABELS, transaction.payment_method)}</DetailValue>
              <DetailValue label="Reference">{transaction.reference || "—"}</DetailValue>
              <DetailValue label="When">{transaction.transaction_at ? formatDateTime(transaction.transaction_at) : "—"}</DetailValue>
              {transaction.source && (
                <DetailValue label="Source">{labelFor(CUSTOMER_PAYMENT_SOURCE_LABELS, transaction.source)}</DetailValue>
              )}
              {transaction.customer_name && <DetailValue label="Customer">{transaction.customer_name}</DetailValue>}
              {transaction.outlet_name && <DetailValue label="POS outlet">{transaction.outlet_name}</DetailValue>}
              {transaction.payment_status && <DetailValue label="Payment status">{transaction.payment_status}</DetailValue>}
              <DetailValue label="Notes" fullWidth multiline>{transaction.notes || "—"}</DetailValue>
            </DetailGrid>
          </FormBlock>
        </div>
      </FormPageLayout>
    </div>
  );
}
