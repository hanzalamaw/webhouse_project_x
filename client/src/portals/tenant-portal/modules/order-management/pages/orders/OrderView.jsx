import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { Button } from "../../../../../../components/Button";
import { StatCard } from "../../../../../../components/StatCard";
import { StatusBadge } from "../../../../../../components/Badge";
import { DetailValue } from "../../../../../../components/DetailValue";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import { MODULE_BASE, ORDER_SOURCE_LABELS, PAYMENT_METHOD_LABELS } from "../../constants";

function truthyFlag(value) {
  return value === true || value === 1 || value === "1";
}

export default function OrderView() {
  const { orderId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/orders/${orderId}`, {}, authFetch)
      .then((data) => {
        if (active) setOrder(data);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    apiFetch(`/orders/payments/order/${orderId}`, {}, authFetch)
      .then((res) => active && setPayments(res.data || []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [orderId, authFetch]);

  if (loading) {
    return <div className="wh-page"><p className="wh-muted">Loading…</p></div>;
  }

  if (error || !order) {
    return (
      <div className="wh-page">
        <PageHeader title="Order" />
        <p className="wh-field__error">{error || "Order not found"}</p>
      </div>
    );
  }

  const items = order.items || [];
  const itemCount = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const subtotal = items.reduce(
    (sum, i) => sum + Math.max(0, (Number(i.quantity) || 0) * (Number(i.unit_price) || 0) - (Number(i.discount) || 0)),
    0
  );
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const payable = Number(order.payable_amount) || 0;
  const amountDue = Math.max(0, payable - totalPaid);
  const hasCancellation = truthyFlag(order.has_cancellation) || order.order_status === "cancelled";
  const hasReturn = truthyFlag(order.has_return) || order.order_status === "returned";
  const hasExchange = truthyFlag(order.has_exchange);
  const hasRefund = truthyFlag(order.has_refund) || order.payment_status === "refunded";

  return (
    <div className="wh-page">
      <PageHeader
        title={`Order ${order.order_no}`}
        description={`Placed ${formatDateTime(order.created_at)}${order.created_by_name ? ` · by ${order.created_by_name}` : ""}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>Back</Button>
            <Button onClick={() => navigate(`${MODULE_BASE}/orders/edit/${order.id}`)}>Edit</Button>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/printing?orderId=${order.id}`)}>Print</Button>
          </>
        }
      />

      <div className="wh-stat-grid">
        <StatCard label="Payable" value={formatPKR(payable)} />
        <StatCard
          label="Amount paid"
          value={formatPKR(totalPaid)}
          tone={totalPaid > 0 ? "success" : "default"}
        />
        <StatCard
          label="Amount due"
          value={formatPKR(amountDue)}
          tone={amountDue > 0 ? "warning" : "success"}
        />
        <StatCard label="Items" value={itemCount} hint={`${items.length} line${items.length === 1 ? "" : "s"}`} />
      </div>

      <Card className="wh-order-aftersales">
        <span className="wh-order-aftersales__label">After sales</span>
        <div className="wh-order-aftersales__actions">
          <Button variant="secondary" className="wh-btn--sm" disabled={hasCancellation} onClick={() => navigate(`${MODULE_BASE}/cancellations/create?orderId=${order.id}`)}>Cancel order</Button>
          <Button variant="secondary" className="wh-btn--sm" disabled={hasReturn} onClick={() => navigate(`${MODULE_BASE}/returns/create?orderId=${order.id}`)}>Return</Button>
          <Button variant="secondary" className="wh-btn--sm" disabled={hasExchange} onClick={() => navigate(`${MODULE_BASE}/exchanges/create?orderId=${order.id}`)}>Exchange</Button>
          <Button variant="secondary" className="wh-btn--sm" disabled={hasRefund} onClick={() => navigate(`${MODULE_BASE}/refunds/create?orderId=${order.id}`)}>Refund</Button>
        </div>
      </Card>

      <div className="wh-order-view-grid">
        <Card>
          <h3 className="wh-card__title">Status</h3>
          <div className="wh-detail-grid">
            <DetailValue label="Order status"><StatusBadge status={order.order_status} /></DetailValue>
            <DetailValue label="Payment"><StatusBadge status={order.payment_status} /></DetailValue>
            <DetailValue label="Fulfillment"><StatusBadge status={order.fulfillment_status} /></DetailValue>
            <DetailValue label="Channel">{ORDER_SOURCE_LABELS[order.order_source] || order.order_source}</DetailValue>
          </div>
        </Card>

        <Card>
          <h3 className="wh-card__title">Customer & delivery</h3>
          <div className="wh-detail-grid">
            <DetailValue label="Customer">{order.customer_name || "—"}</DetailValue>
            <DetailValue label="City">{order.city || "—"}</DetailValue>
          </div>
          {order.delivery_address && (
            <DetailValue label="Delivery address" fullWidth>{order.delivery_address}</DetailValue>
          )}
          {order.notes && <DetailValue label="Notes" fullWidth multiline>{order.notes}</DetailValue>}
        </Card>
      </div>

      <Card className="wh-card--table wh-order-items-card">
        <div className="wh-order-items-card__head">
          <h3 className="wh-card__title">Line items</h3>
          <span className="wh-order-items-card__count">{items.length} product{items.length === 1 ? "" : "s"} · {itemCount} unit{itemCount === 1 ? "" : "s"}</span>
        </div>
        <ul className="wh-order-item-list">
          {items.map((item) => (
            <li key={item.id} className="wh-order-item-row">
              <div className="wh-order-item-row__main">
                <span className="wh-order-item-qty">×{item.quantity}</span>
                <div className="wh-order-item-row__text">
                  <span className="wh-order-item-product__name">{item.product_name}</span>
                  <span className="wh-order-item-product__sub">
                    {item.sku ? `SKU ${item.sku} · ` : ""}{formatPKR(item.unit_price)} each
                    {Number(item.discount) > 0 ? ` · − ${formatPKR(item.discount)} discount` : ""}
                  </span>
                </div>
              </div>
              <span className="wh-order-item-row__total">{formatPKR(item.total_price)}</span>
            </li>
          ))}
          {items.length === 0 && <li className="wh-muted wh-order-item-row wh-order-item-row--empty">No line items.</li>}
        </ul>

        <div className="wh-order-summary">
          <div className="wh-order-summary__row">
            <span>Subtotal</span>
            <span>{formatPKR(subtotal)}</span>
          </div>
          <div className="wh-order-summary__row">
            <span>Order discount</span>
            <span>− {formatPKR(order.discount_amount)}</span>
          </div>
          <div className="wh-order-summary__row">
            <span>Delivery</span>
            <span>+ {formatPKR(order.delivery_charges)}</span>
          </div>
          <div className="wh-order-summary__row wh-order-summary__row--total">
            <span>Payable</span>
            <span>{formatPKR(payable)}</span>
          </div>
        </div>
      </Card>

      {payments.length > 0 && (
        <Card className="wh-card--table">
          <h3 className="wh-card__title">Payments</h3>
          <div className="wh-table-wrap">
            <table className="wh-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paid_at ? formatDateTime(p.paid_at) : "—"}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method || "—"}</td>
                    <td className="wh-order-lines-table__total">{formatPKR(p.amount)}</td>
                    <td><StatusBadge status={p.payment_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
