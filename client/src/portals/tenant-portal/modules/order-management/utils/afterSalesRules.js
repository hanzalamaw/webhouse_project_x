export function truthyFlag(value) {
  return value === true || value === 1 || value === "1";
}

export function orderAfterSalesFlags(order) {
  if (!order) {
    return {
      cancelled: false,
      returned: false,
      refunded: false,
      hasCancellation: false,
      hasReturn: false,
      hasExchange: false,
      hasRefund: false,
    };
  }

  return {
    cancelled: String(order.order_status || "").toLowerCase() === "cancelled",
    returned: String(order.order_status || "").toLowerCase() === "returned",
    refunded: String(order.payment_status || "").toLowerCase() === "refunded",
    hasCancellation: truthyFlag(order.has_cancellation),
    hasReturn: truthyFlag(order.has_return),
    hasExchange: truthyFlag(order.has_exchange),
    hasRefund: truthyFlag(order.has_refund),
  };
}

/** At most one after-sales type per order (cancellation, return, exchange, or refund). */
export function getActiveAfterSalesType(order) {
  const flags = orderAfterSalesFlags(order);
  if (flags.hasCancellation || flags.cancelled) return "cancellation";
  if (flags.hasReturn || flags.returned) return "return";
  if (flags.hasExchange) return "exchange";
  if (flags.hasRefund || flags.refunded) return "refund";
  return null;
}

export function isOrderEligibleForCancellation(order) {
  return getActiveAfterSalesType(order) === null;
}

export function isOrderEligibleForReturn(order) {
  if (order?.is_shopify_linked) return false;
  return getActiveAfterSalesType(order) === null;
}

export function isOrderEligibleForExchange(order) {
  if (order?.is_shopify_linked) return false;
  return getActiveAfterSalesType(order) === null;
}

export function isOrderPaid(order) {
  const status = String(order?.payment_status || "").toLowerCase();
  return status === "paid" || status === "partial" || status === "partially_paid";
}

export function isOrderEligibleForRefund(order) {
  const active = getActiveAfterSalesType(order);
  if (active === "refund") return false;
  if (active === "exchange" || active === "return") return false;
  if (!isOrderPaid(order)) return false;
  return active === null || active === "cancellation";
}

/** Primary after-sales record for an order (at most one). */
export function getOrderAfterSalesState(order) {
  const active = getActiveAfterSalesType(order);
  if (active === "cancellation") {
    return {
      type: "cancellation",
      label: "Cancelled",
      managePath: "cancellations/manage",
      canRefund: isOrderPaid(order) && isOrderEligibleForRefund(order),
    };
  }
  if (active === "return") {
    return { type: "return", label: "Returned", managePath: "returns/manage", canRefund: false };
  }
  if (active === "exchange") {
    return { type: "exchange", label: "Exchanged", managePath: "exchanges/manage", canRefund: false };
  }
  if (active === "refund") {
    return { type: "refund", label: "Refunded", managePath: "refunds/manage", canRefund: false };
  }
  return null;
}

export function orderHasAfterSales(order) {
  return Boolean(getOrderAfterSalesState(order));
}

const AFTER_SALES_LABELS = {
  cancellation: "a cancellation",
  return: "a return",
  exchange: "an exchange",
  refund: "a refund",
};

export function afterSalesIneligibilityMessage(order, action) {
  const active = getActiveAfterSalesType(order);
  if (action === "return" && order?.is_shopify_linked) {
    return "Returns on Shopify-linked orders must be processed in Shopify admin.";
  }
  if (action === "exchange" && order?.is_shopify_linked) {
    return "Exchanges on Shopify-linked orders must be processed in Shopify admin.";
  }
  if (active === action) {
    return `This order already has ${AFTER_SALES_LABELS[action] || "this after-sales action"} recorded.`;
  }
  if (active && active !== action) {
    if (action === "refund" && active === "cancellation") {
      if (!isOrderPaid(order)) return "Only paid or partially paid orders can be refunded.";
      return null;
    }
    return `This order already has ${AFTER_SALES_LABELS[active] || "another after-sales action"} recorded.`;
  }
  if (action === "refund" && !isOrderPaid(order)) {
    return "Only paid or partially paid orders can be refunded.";
  }
  return "This order is not eligible for this action.";
}
