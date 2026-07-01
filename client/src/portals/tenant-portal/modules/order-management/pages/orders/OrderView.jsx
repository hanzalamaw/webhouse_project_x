import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { DetailValue } from "../../../../../../components/DetailValue";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { formatPKR } from "../../../../../../utils/currency";
import { MODULE_BASE, ORDER_SOURCE_LABELS } from "../../constants";

export default function OrderView() {
  const { orderId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/orders/${orderId}`, {}, authFetch)
      .then(setOrder)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
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

  return (
    <div className="wh-page">
      <PageHeader
        title={`Order ${order.order_no}`}
        description="Order details, line items, and status."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/orders/manage`)}>Back</Button>
            <Button onClick={() => navigate(`${MODULE_BASE}/orders/edit/${order.id}`)}>Edit</Button>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/printing?orderId=${order.id}`)}>Print</Button>
          </>
        }
      />
      <Card>
        <div className="wh-detail-grid">
          <DetailValue label="Customer">{order.customer_name || "—"}</DetailValue>
          <DetailValue label="Channel">{ORDER_SOURCE_LABELS[order.order_source] || order.order_source}</DetailValue>
          <DetailValue label="Status"><StatusBadge status={order.order_status} /></DetailValue>
          <DetailValue label="Payment"><StatusBadge status={order.payment_status} /></DetailValue>
          <DetailValue label="Fulfillment"><StatusBadge status={order.fulfillment_status} /></DetailValue>
          <DetailValue label="City">{order.city || "—"}</DetailValue>
          <DetailValue label="Payable">{formatPKR(order.payable_amount)}</DetailValue>
          <DetailValue label="Created">{formatDateTime(order.created_at)}</DetailValue>
        </div>
        {order.delivery_address && <DetailValue label="Delivery address" fullWidth>{order.delivery_address}</DetailValue>}
        {order.notes && <DetailValue label="Notes" fullWidth multiline>{order.notes}</DetailValue>}
      </Card>

      <Card className="wh-card--table">
        <h3 className="wh-card__title">Line items</h3>
        <table className="wh-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Discount</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(order.items || []).map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{item.sku}</td>
                <td>{item.quantity}</td>
                <td>{formatPKR(item.unit_price)}</td>
                <td>{formatPKR(item.discount)}</td>
                <td>{formatPKR(item.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
