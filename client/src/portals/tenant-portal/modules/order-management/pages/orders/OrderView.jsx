import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { Button } from "../../../../../../components/Button";
import { ConfirmDeleteModal } from "../../../../../../components/ConfirmDeleteModal";
import { StatCard } from "../../../../../../components/StatCard";
import { StatusBadge } from "../../../../../../components/Badge";
import { DetailValue } from "../../../../../../components/DetailValue";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import { MODULE_BASE, ORDER_SOURCE_LABELS, PAYMENT_METHOD_LABELS } from "../../constants";
import { OrderItemsCardHead } from "../../components/OrderItemsCardHead";
import { OrderTotalsSummary } from "../../components/OrderTotalsSummary";
import {
  calcLineTotal,
  computeOrderTotals,
  lineTaxForQty,
  mapOrderItemFromApi,
} from "../../utils/orderLinePricing";
import {
  getOrderAfterSalesState,
  isOrderEligibleForCancellation,
  isOrderEligibleForExchange,
  isOrderEligibleForRefund,
  isOrderEligibleForReturn,
} from "../../utils/afterSalesRules";

export default function OrderView() {
  const { orderId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit, canDelete } = useModulePermission("order-management");
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const confirmDelete = async () => {
    if (!order) return;
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/orders/${order.id}`, { method: "DELETE" }, authFetch);
      setDeleteOpen(false);
      navigate(`${MODULE_BASE}/orders/manage`);
    } catch (e) {
      setError(e.message);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="wh-page"><p className="wh-muted">Loading…</p></div>;
  }

  if (!order) {
    return (
      <div className="wh-page">
        <PageHeader title="Order" />
        <p className="wh-field__error">{error || "Order not found"}</p>
      </div>
    );
  }

  const items = order.items || [];
  const mappedItems = items.map((item) => mapOrderItemFromApi(item));
  const itemCount = items.length;
  const unitCount = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totals = computeOrderTotals(mappedItems, order.discount_amount, order.delivery_charges);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const payable = Number(order.payable_amount) || totals.payable;
  const amountDue = Math.max(0, payable - totalPaid);
  const afterSales = getOrderAfterSalesState(order);
  const hasAfterSales = Boolean(afterSales);
  const canEditOrder = canEdit && String(order.order_status || "").toLowerCase() !== "cancelled";

  return (
    <div className="wh-page">
      <PageHeader
        title={`Order ${order.order_no}`}
        description={`Placed ${formatDateTime(order.created_at)}${order.created_by_name ? ` · by ${order.created_by_name}` : ""}`}
        actions={
          <div className="wh-action-btns">
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>Back</Button>
            {canEditOrder && (
              <Button onClick={() => navigate(`${MODULE_BASE}/orders/edit/${order.id}`)}>Edit</Button>
            )}
            {canDelete && (
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete</Button>
            )}
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/printing?orderId=${order.id}`)}>Print</Button>
          </div>
        }
      />

      {error && <div className="wh-alert wh-alert--error">{error}</div>}

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
        <StatCard label="Items" value={unitCount} hint={`${itemCount} line${itemCount === 1 ? "" : "s"}`} />
      </div>

      <Card className="wh-order-aftersales">
        <span className="wh-order-aftersales__label">After sales</span>
        {hasAfterSales ? (
          <div className="wh-order-aftersales__status">
            <StatusBadge status={afterSales.type === "cancellation" ? "cancelled" : afterSales.type === "return" ? "returned" : afterSales.type} />
            <span className="wh-muted">This order is recorded as <strong>{afterSales.label}</strong>.</span>
            <Button
              variant="secondary"
              className="wh-btn--sm"
              onClick={() => navigate(`${MODULE_BASE}/${afterSales.managePath}`)}
            >
              View in {afterSales.label.toLowerCase()} list
            </Button>
            {afterSales.canRefund && (
              <Button
                variant="secondary"
                className="wh-btn--sm"
                onClick={() => navigate(`${MODULE_BASE}/refunds/create?orderId=${order.id}`)}
              >
                Record refund
              </Button>
            )}
          </div>
        ) : (
          <div className="wh-order-aftersales__actions">
            <Button variant="secondary" className="wh-btn--sm" disabled={!isOrderEligibleForCancellation(order)} onClick={() => navigate(`${MODULE_BASE}/cancellations/create?orderId=${order.id}`)}>Cancel order</Button>
            <Button variant="secondary" className="wh-btn--sm" disabled={!isOrderEligibleForReturn(order)} onClick={() => navigate(`${MODULE_BASE}/returns/create?orderId=${order.id}`)}>Return</Button>
            <Button variant="secondary" className="wh-btn--sm" disabled={!isOrderEligibleForExchange(order)} onClick={() => navigate(`${MODULE_BASE}/exchanges/create?orderId=${order.id}`)}>Exchange</Button>
            <Button variant="secondary" className="wh-btn--sm" disabled={!isOrderEligibleForRefund(order)} onClick={() => navigate(`${MODULE_BASE}/refunds/create?orderId=${order.id}`)}>Refund</Button>
          </div>
        )}
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
        <OrderItemsCardHead itemCount={itemCount} unitCount={unitCount} />
        <ul className="wh-order-item-list">
          {items.map((item, index) => {
            const row = mappedItems[index];
            const qty = Number(item.quantity) || 0;
            const lineTax = lineTaxForQty(qty, row.product_tax);
            const metaParts = [];
            if (item.sku) metaParts.push(`SKU ${item.sku}`);
            metaParts.push(`${formatPKR(item.unit_price)} each`);
            if (Number(item.discount) > 0) metaParts.push(`− ${formatPKR(item.discount)} discount`);
            if (lineTax > 0) metaParts.push(`+ ${formatPKR(lineTax)} tax`);

            return (
              <li key={item.id} className="wh-order-item-row">
                <span className="wh-order-item-qty">×{item.quantity}</span>
                <div className="wh-order-item-row__text">
                  <span className="wh-order-item-product__name">{item.product_name}</span>
                  <span className="wh-order-item-product__sub">{metaParts.join(" · ")}</span>
                </div>
                <span className="wh-order-item-row__total">{formatPKR(calcLineTotal(row))}</span>
              </li>
            );
          })}
          {items.length === 0 && <li className="wh-muted wh-order-item-row wh-order-item-row--empty">No line items.</li>}
        </ul>

        <OrderTotalsSummary
          subtotal={totals.subtotal}
          lineDiscountTotal={totals.lineDiscountTotal}
          taxTotal={totals.taxTotal}
          orderDiscount={totals.orderDiscount}
          delivery={totals.delivery}
          payable={payable}
        />
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

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete order"
        recordName={order.order_no || "this order"}
        onConfirm={confirmDelete}
        onClose={() => setDeleteOpen(false)}
        loading={deleting}
      />
    </div>
  );
}
