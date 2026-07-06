import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SearchableSelect } from "../../../../../components/SearchableSelect";
import { StatusBadge } from "../../../../../components/Badge";
import { formatPKR } from "../../../../../utils/currency";
import { formatDateTime } from "../../../../../utils/dateTime";
import { MODULE_BASE } from "../constants";

export function AfterSalesOrderSection({
  orders,
  value,
  onChange,
  disabled,
  filterOrders,
  placeholder = "Search by order number or customer…",
  prefillLocked = false,
  ineligibleMessage = null,
  footer = null,
}) {
  const filteredOrders = useMemo(
    () => (filterOrders ? filterOrders(orders) : orders),
    [orders, filterOrders]
  );

  const selected = useMemo(
    () => orders.find((o) => String(o.id) === String(value)) || null,
    [orders, value]
  );

  const orderOptions = useMemo(() => {
    const opts = filteredOrders.map((o) => ({
      value: String(o.id),
      label: `${o.order_no} — ${o.customer_name || "No customer"}`,
    }));
    if (!value || !selected) return opts;
    if (opts.some((o) => String(o.value) === String(value))) return opts;
    return [
      {
        value: String(selected.id),
        label: `${selected.order_no} — ${selected.customer_name || "No customer"}`,
      },
      ...opts,
    ];
  }, [filteredOrders, selected, value]);

  const orderViewPath = selected ? `${MODULE_BASE}/orders/view/${selected.id}` : null;

  return (
    <div className="wh-aftersales-order">
      <SearchableSelect
        id="aftersales-order"
        label="Order"
        value={value ? String(value) : ""}
        onChange={onChange}
        options={orderOptions}
        placeholder={placeholder}
        disabled={disabled || prefillLocked}
      />

      {selected ? (
        <div className="wh-aftersales-order-card">
          <div className="wh-aftersales-order-card__head">
            <div>
              <span className="wh-aftersales-order-card__no">{selected.order_no}</span>
              <span className="wh-aftersales-order-card__customer">{selected.customer_name || "No customer"}</span>
            </div>
            <span className="wh-aftersales-order-card__amount">{formatPKR(selected.payable_amount)}</span>
          </div>
          <div className="wh-aftersales-order-card__meta">
            <StatusBadge status={selected.order_status} />
            <StatusBadge status={selected.payment_status} />
            {selected.city && <span className="wh-aftersales-order-card__chip">{selected.city}</span>}
            {selected.created_at && (
              <span className="wh-aftersales-order-card__date">{formatDateTime(selected.created_at)}</span>
            )}
          </div>
          {ineligibleMessage && (
            <div className="wh-alert wh-alert--warning wh-aftersales-order-card__alert">{ineligibleMessage}</div>
          )}
          <div className="wh-aftersales-order-card__actions">
            {orderViewPath && (
              <Link to={orderViewPath} className="wh-btn wh-btn--secondary wh-btn--sm">
                View order
              </Link>
            )}
            {footer}
          </div>
        </div>
      ) : (
        <p className="wh-muted wh-aftersales-order__hint">Select an order to see its summary here.</p>
      )}
    </div>
  );
}
