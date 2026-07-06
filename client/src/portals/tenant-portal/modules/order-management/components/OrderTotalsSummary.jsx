import { formatPKR } from "../../../../../utils/currency";

export function OrderTotalsSummary({
  subtotal,
  lineDiscountTotal = 0,
  taxTotal = 0,
  orderDiscount = 0,
  delivery = 0,
  payable,
}) {
  return (
    <div className="wh-order-summary">
      <div className="wh-order-summary__row">
        <span>Items subtotal</span>
        <span>{formatPKR(subtotal)}</span>
      </div>
      {lineDiscountTotal > 0 && (
        <div className="wh-order-summary__row">
          <span>Product discounts</span>
          <span>− {formatPKR(lineDiscountTotal)}</span>
        </div>
      )}
      <div className="wh-order-summary__row">
        <span>Order discount</span>
        <span>− {formatPKR(orderDiscount)}</span>
      </div>
      {taxTotal > 0 && (
        <div className="wh-order-summary__row">
          <span>Product tax</span>
          <span>+ {formatPKR(taxTotal)}</span>
        </div>
      )}
      <div className="wh-order-summary__row">
        <span>Delivery</span>
        <span>+ {formatPKR(delivery)}</span>
      </div>
      <div className="wh-order-summary__row wh-order-summary__row--total">
        <span>Payable</span>
        <span>{formatPKR(payable)}</span>
      </div>
    </div>
  );
}
