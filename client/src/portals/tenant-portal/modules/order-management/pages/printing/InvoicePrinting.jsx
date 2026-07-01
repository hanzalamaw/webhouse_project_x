import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch, fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Card } from "../../../../../../components/Card";
import { Button } from "../../../../../../components/Button";
import { SearchableSelect } from "../../../../../../components/SearchableSelect";
import { FormField } from "../../../../../../components/FormField";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { PRINT_DOC_TYPES } from "../../constants";

export default function InvoicePrinting() {
  const { authFetch } = useAuth();
  const { canView } = useModulePermission("order-management");
  const [searchParams] = useSearchParams();
  const printRef = useRef(null);
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState(searchParams.get("orderId") || "");
  const [docType, setDocType] = useState("invoice");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const orderOptions = useMemo(
    () => orders.map((o) => ({ value: String(o.id), label: o.order_no })),
    [orders]
  );

  useEffect(() => {
    fetchAllTableRows("/orders", authFetch)
      .then(setOrders)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authFetch]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    apiFetch(`/orders/${orderId}`, {}, authFetch)
      .then(setOrder)
      .catch((e) => setError(e.message));
  }, [orderId, authFetch]);

  const docTitle = PRINT_DOC_TYPES.find((d) => d.key === docType)?.label || "Document";

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>${docTitle}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
        h1 { margin: 0 0 8px; font-size: 22px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; }
        .meta { margin: 12px 0; font-size: 13px; line-height: 1.6; }
      </style></head><body>${printRef.current.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  if (!canView) {
    return <div className="wh-page"><p className="wh-muted">You do not have permission to print documents.</p></div>;
  }

  return (
    <div className="wh-page">
      <PageHeader
        title="Invoice & Slip Printing"
        description="Generate invoices, packing slips, order receipts, and delivery documents."
      />

      <Card>
        <div className="wh-form-grid wh-form-grid--2">
          <FormField label="Order">
            <SearchableSelect
              options={orderOptions}
              value={orderId}
              onChange={setOrderId}
              placeholder={loading ? "Loading orders…" : "Select order"}
            />
          </FormField>
          <FormField label="Document type">
            <select className="wh-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {PRINT_DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </FormField>
        </div>
        <div className="wh-card__actions">
          <Button onClick={handlePrint} disabled={!order}>Print {docTitle}</Button>
        </div>
      </Card>

      {error && <p className="wh-field__error">{error}</p>}

      {order && (
        <Card>
          <div ref={printRef}>
            <h1>{docTitle}</h1>
            <div className="meta">
              <div><strong>Order:</strong> {order.order_no}</div>
              <div><strong>Customer:</strong> {order.customer_name || "—"}</div>
              <div><strong>Date:</strong> {formatDateTime(order.created_at)}</div>
              <div><strong>Status:</strong> {order.order_status}</div>
              {docType === "delivery" && order.delivery_address && (
                <div><strong>Delivery address:</strong> {order.delivery_address}</div>
              )}
              {docType === "packing_slip" && (
                <div><strong>Fulfillment:</strong> {order.fulfillment_status}</div>
              )}
              {docType === "receipt" && (
                <div><strong>Payment:</strong> {order.payment_status} — {formatPKR(order.payable_amount)}</div>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  {docType !== "packing_slip" && <th>Unit price</th>}
                  {docType !== "packing_slip" && <th>Total</th>}
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.sku}</td>
                    <td>{item.quantity}</td>
                    {docType !== "packing_slip" && <td>{formatPKR(item.unit_price)}</td>}
                    {docType !== "packing_slip" && <td>{formatPKR(item.total_price)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {docType === "invoice" && (
              <div className="meta" style={{ marginTop: 16 }}>
                <div><strong>Subtotal:</strong> {formatPKR(order.total_amount)}</div>
                <div><strong>Discount:</strong> {formatPKR(order.discount_amount)}</div>
                <div><strong>Delivery:</strong> {formatPKR(order.delivery_charges)}</div>
                <div><strong>Payable:</strong> {formatPKR(order.payable_amount)}</div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
