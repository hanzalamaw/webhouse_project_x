import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { apiFetch } from "../../../../../api/client";
import { PageHeader } from "../../../../../components/PageHeader";
import { FormPageLayout } from "../../../../../components/FormPageLayout";
import { FormBlock } from "../../../../../components/FormBlock";
import { Button } from "../../../../../components/Button";
import { StatusBadge } from "../../../../../components/Badge";
import { RecordViewSummary, DetailGrid, DetailValue } from "../../../../../components/RecordView";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { MODULE_BASE, CUSTOMER_PAYMENT_SOURCE_LABELS, PAYMENT_METHOD_LABELS, labelFor } from "../constants";

export default function ViewCustomerPayment() {
  const { paymentId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayment(await apiFetch(`/finance/customer-payments/${encodeURIComponent(paymentId)}`, {}, authFetch));
    } catch (e) {
      setPayment(null);
      setError(e.message || "Payment not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, paymentId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Payment not found"}</div>
          <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customer-payments`)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  const sourceLabel = labelFor(CUSTOMER_PAYMENT_SOURCE_LABELS, payment.source);

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Customer payment"
          description="Payment received from an order or POS sale."
          actions={
            <div className="wh-action-btns">
              <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/customer-payments`)}>All payments</Button>
              {payment.source === "order" && payment.order_id && (
                <>
                  <Button variant="secondary" onClick={() => navigate(`/app/m/order-management/orders/view/${payment.order_id}`)}>View order</Button>
                  <Button onClick={() => navigate("/app/m/order-management/payments/manage", { state: { openOrderId: payment.order_id } })}>
                    Record payment
                  </Button>
                </>
              )}
            </div>
          }
        />

        <div className="wh-form-stack">
          <RecordViewSummary
            title={formatPKR(payment.amount)}
            subtitle={[sourceLabel, payment.reference_no || payment.order_no].filter(Boolean).join(" · ")}
            status={payment.payment_status}
            chips={[
              { label: "Customer", value: payment.customer_name || "Walk-in" },
              { label: "Paid at", value: payment.paid_at ? formatDateTime(payment.paid_at) : "—" },
            ]}
          />

          <FormBlock title="Payment details">
            <DetailGrid>
              <DetailValue label="Source">{sourceLabel}</DetailValue>
              <DetailValue label="Reference #">{payment.reference_no || "—"}</DetailValue>
              <DetailValue label="Customer">{payment.customer_name || "Walk-in"}</DetailValue>
              <DetailValue label="Amount" highlight>{formatPKR(payment.amount)}</DetailValue>
              <DetailValue label="Method">{labelFor(PAYMENT_METHOD_LABELS, payment.payment_method)}</DetailValue>
              <DetailValue label="Status"><StatusBadge status={payment.payment_status} /></DetailValue>
              {payment.source === "order" && (
                <DetailValue label="Order payment status">{payment.order_payment_status || "—"}</DetailValue>
              )}
              {payment.outlet_name && <DetailValue label="POS outlet">{payment.outlet_name}</DetailValue>}
              <DetailValue label="Total">{formatPKR(payment.payable_amount)}</DetailValue>
              <DetailValue label="Paid at">{payment.paid_at ? formatDateTime(payment.paid_at) : "—"}</DetailValue>
            </DetailGrid>
          </FormBlock>
        </div>
      </FormPageLayout>
    </div>
  );
}
