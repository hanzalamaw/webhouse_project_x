import { orderRepository } from "../repositories/orderRepository.js";
import { cascadeSoftDeleteOrder } from "../utils/orderSoftDelete.js";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  FULFILLMENT_STATUSES,
  ORDER_SOURCES,
  PAYMENT_METHODS,
  PAYMENT_RECORD_STATUSES,
  ASSIGNMENT_TYPES,
  ASSIGNMENT_STATUSES,
  RETURN_STATUSES,
  EXCHANGE_STATUSES,
  REFUND_STATUSES,
  REFUND_METHODS,
} from "../utils/orderConstants.js";

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}. Use: ${allowed.join(", ")}`);
  }
}

function requireString(value, label) {
  const s = String(value || "").trim();
  if (!s) throw new Error(`${label} is required`);
  return s;
}

function toNumber(value, label, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`Invalid ${label}`);
  return n;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("At least one order item is required");
  return items.map((item, idx) => {
    const product_name = requireString(item.product_name, `Item ${idx + 1} product name`);
    const sku = requireString(item.sku, `Item ${idx + 1} SKU`);
    const quantity = toNumber(item.quantity, `Item ${idx + 1} quantity`, { min: 1 });
    const unit_price = toNumber(item.unit_price, `Item ${idx + 1} unit price`);
    const discount = toNumber(item.discount ?? 0, `Item ${idx + 1} discount`);
    const total_price = toNumber(item.total_price ?? quantity * unit_price - discount, `Item ${idx + 1} total`);
    const product_id = item.product_id ? Number(item.product_id) : null;
    return { product_name, sku, quantity, unit_price, discount, total_price, product_id };
  });
}

function calcOrderTotals(items, discountAmount, deliveryCharges) {
  const total_amount = items.reduce((sum, i) => sum + i.total_price, 0);
  const discount_amount = toNumber(discountAmount ?? 0, "discount amount");
  const delivery_charges = toNumber(deliveryCharges ?? 0, "delivery charges");
  const payable_amount = Math.max(0, total_amount - discount_amount + delivery_charges);
  return { total_amount, discount_amount, delivery_charges, payable_amount };
}

async function assertOrderExists(tenantId, orderId) {
  const order = await orderRepository.getOrder(tenantId, orderId);
  if (!order) throw new Error("Order not found");
  return order;
}

async function assertOrderUser(tenantId, userId) {
  if (!userId) throw new Error("Assigned user is required");
  const users = await orderRepository.listOrderUsers(tenantId);
  if (!users.some((u) => u.id === Number(userId))) {
    throw new Error("Assigned user must have Order Management access");
  }
  return Number(userId);
}

async function syncOrderPaymentStatus(tenantId, orderId) {
  const order = await orderRepository.getOrder(tenantId, orderId);
  if (!order) return;
  const paid = await orderRepository.sumPaymentsForOrder(tenantId, orderId);
  const payable = Number(order.payable_amount) || 0;
  let payment_status = "unpaid";
  if (paid <= 0) payment_status = "unpaid";
  else if (paid >= payable) payment_status = "paid";
  else payment_status = "partial";
  await orderRepository.updateOrder(tenantId, orderId, {
    ...order,
    order_source: order.order_source,
    order_status: order.order_status,
    payment_status,
    fulfillment_status: order.fulfillment_status,
    total_amount: order.total_amount,
    discount_amount: order.discount_amount,
    delivery_charges: order.delivery_charges,
    payable_amount: order.payable_amount,
    city: order.city,
    delivery_address: order.delivery_address,
    notes: order.notes,
    customer_id: order.customer_id,
  });
}

async function ensureFieldOption(tenantId, fieldKey, value, defaults) {
  const v = String(value || "").trim();
  if (!v) throw new Error(`Invalid ${fieldKey}`);
  const custom = await orderRepository.listFieldOptions(tenantId, fieldKey);
  const allowed = new Set([...defaults, ...custom]);
  if (!allowed.has(v)) {
    await orderRepository.addFieldOption(tenantId, fieldKey, v);
  }
  return v;
}

async function mapOrderPayload(tenantId, body, items) {
  const order_status = await ensureFieldOption(tenantId, "order_status", body.order_status || "pending", ORDER_STATUSES);
  const payment_status = await ensureFieldOption(tenantId, "payment_status", body.payment_status || "unpaid", PAYMENT_STATUSES);
  const fulfillment_status = await ensureFieldOption(tenantId, "fulfillment_status", body.fulfillment_status || "unfulfilled", FULFILLMENT_STATUSES);
  const order_source = await ensureFieldOption(tenantId, "channel", body.order_source || "manual", ORDER_SOURCES);
  const totals = calcOrderTotals(items, body.discount_amount, body.delivery_charges);
  return {
    order_source,
    order_status,
    payment_status,
    fulfillment_status,
    ...totals,
    city: body.city ? String(body.city).trim() : null,
    delivery_address: body.delivery_address ? String(body.delivery_address).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    customer_id: body.customer_id ? Number(body.customer_id) : null,
  };
}

async function mergedFieldOptions(tenantId) {
  const keys = {
    channel: ORDER_SOURCES,
    order_status: ORDER_STATUSES,
    payment_status: PAYMENT_STATUSES,
    fulfillment_status: FULFILLMENT_STATUSES,
  };
  const out = {};
  for (const [key, defaults] of Object.entries(keys)) {
    const custom = await orderRepository.listFieldOptions(tenantId, key);
    out[key] = [...new Set([...defaults, ...custom])];
  }
  return out;
}

export const orderService = {
  async dashboard(tenantId) {
    const stats = await orderRepository.dashboardStats(tenantId);
    return {
      stats,
      orders_by_status: await orderRepository.dashboardOrdersByStatus(tenantId),
      fulfillment_by_status: await orderRepository.dashboardFulfillmentByStatus(tenantId),
      payment_by_status: await orderRepository.dashboardPaymentByStatus(tenantId),
      orders_by_month: await orderRepository.dashboardOrdersByMonth(tenantId),
      recent_orders: await orderRepository.dashboardRecentOrders(tenantId),
    };
  },

  async referenceData(tenantId) {
    const [order_users, customers, products, warehouses, field_options] = await Promise.all([
      orderRepository.listOrderUsers(tenantId).catch(() => []),
      orderRepository.listCustomers(tenantId).catch(() => []),
      orderRepository.listProducts(tenantId).catch(() => []),
      orderRepository.listWarehouses(tenantId).catch(() => []),
      mergedFieldOptions(tenantId).catch(() => ({
        channel: ORDER_SOURCES,
        order_status: ORDER_STATUSES,
        payment_status: PAYMENT_STATUSES,
        fulfillment_status: FULFILLMENT_STATUSES,
      })),
    ]);
    return { order_users, customers, products, warehouses, field_options };
  },

  async warehouseProducts(tenantId, warehouseId) {
    return orderRepository.listWarehouseProducts(tenantId, warehouseId);
  },

  async addFieldOption(tenantId, fieldKey, optionValue) {
    const allowedKeys = new Set(["channel", "order_status", "payment_status", "fulfillment_status"]);
    if (!allowedKeys.has(fieldKey)) throw new Error("Invalid field key");
    await orderRepository.addFieldOption(tenantId, fieldKey, optionValue);
    return mergedFieldOptions(tenantId);
  },

  listOrders(tenantId) {
    return orderRepository.listOrders(tenantId);
  },

  getOrder(tenantId, id) {
    return orderRepository.getOrder(tenantId, id);
  },

  async createOrder(tenantId, userId, body) {
    const items = normalizeItems(body.items);
    const data = await mapOrderPayload(tenantId, body, items);
    data.order_no = await orderRepository.generateOrderNo(tenantId);
    const orderId = await orderRepository.createOrder(tenantId, userId, data, items);
    return orderRepository.getOrder(tenantId, orderId);
  },

  async updateOrder(tenantId, id, body) {
    const existing = await orderRepository.getOrder(tenantId, id);
    if (!existing) return null;
    const items = body.items ? normalizeItems(body.items) : existing.items;
    const data = await mapOrderPayload(tenantId, { ...existing, ...body }, items);
    const ok = await orderRepository.updateOrder(tenantId, id, data);
    if (!ok) return null;
    if (body.items) await orderRepository.replaceOrderItems(tenantId, id, items);
    return orderRepository.getOrder(tenantId, id);
  },

  async deleteOrder(tenantId, id) {
    return cascadeSoftDeleteOrder(id, tenantId);
  },

  async exportOrders(tenantId) {
    const orders = await orderRepository.listOrders(tenantId);
    return orders.map((o) => ({
      order_no: o.order_no,
      order_source: o.order_source,
      order_status: o.order_status,
      payment_status: o.payment_status,
      fulfillment_status: o.fulfillment_status,
      customer_name: o.customer_name || "",
      city: o.city || "",
      delivery_address: o.delivery_address || "",
      total_amount: o.total_amount,
      discount_amount: o.discount_amount,
      delivery_charges: o.delivery_charges,
      payable_amount: o.payable_amount,
      payment_method: o.payment_method || "",
      notes: o.notes || "",
      created_at: o.created_at,
    }));
  },

  async importOrders(tenantId, userId, rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error("No rows to import");
    const results = { created: 0, skipped: 0, errors: [] };
    const customers = await orderRepository.listCustomers(tenantId);
    const customerByName = new Map(customers.map((c) => [c.customer_name.toLowerCase(), c.id]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const order_no = String(row.order_no || "").trim() || await orderRepository.generateOrderNo(tenantId);
        const customerName = String(row.customer_name || "").trim().toLowerCase();
        const customer_id = customerByName.get(customerName) || null;
        const items = [{
          product_name: requireString(row.product_name || row.item_name, "product_name"),
          sku: requireString(row.sku || row.item_sku, "sku"),
          quantity: toNumber(row.quantity ?? 1, "quantity", { min: 1 }),
          unit_price: toNumber(row.unit_price ?? row.payable_amount ?? 0, "unit_price"),
          discount: toNumber(row.item_discount ?? 0, "discount"),
          total_price: toNumber(row.item_total ?? row.payable_amount ?? row.unit_price ?? 0, "total_price"),
          product_id: null,
        }];
        const data = await mapOrderPayload(tenantId, {
          order_source: row.order_source || "csv_import",
          order_status: row.order_status || "pending",
          payment_status: row.payment_status || "unpaid",
          fulfillment_status: row.fulfillment_status || "unfulfilled",
          discount_amount: row.discount_amount ?? 0,
          delivery_charges: row.delivery_charges ?? 0,
          city: row.city,
          delivery_address: row.delivery_address,
          notes: row.notes,
          customer_id,
        }, items);
        data.order_no = order_no;
        await orderRepository.createOrder(tenantId, userId, data, items);
        results.created += 1;
      } catch (e) {
        results.skipped += 1;
        results.errors.push({ row: i + 1, message: e.message });
      }
    }
    return results;
  },

  // Assignments
  listAssignments(tenantId) {
    return orderRepository.listAssignments(tenantId);
  },

  async createAssignment(tenantId, body) {
    await assertOrderExists(tenantId, body.order_id);
    const assigned_to = await assertOrderUser(tenantId, body.assigned_to);
    const assignment_type = body.assignment_type || "staff";
    const status = body.status || "pending";
    assertOneOf(assignment_type, ASSIGNMENT_TYPES, "assignment type");
    assertOneOf(status, ASSIGNMENT_STATUSES, "assignment status");
    const id = await orderRepository.createAssignment(tenantId, {
      order_id: Number(body.order_id),
      assigned_to,
      assignment_type,
      status,
    });
    const rows = await orderRepository.listAssignments(tenantId);
    return rows.find((r) => r.id === id);
  },

  async updateAssignment(tenantId, id, body) {
    const assigned_to = await assertOrderUser(tenantId, body.assigned_to);
    const assignment_type = body.assignment_type || "staff";
    const status = body.status || "pending";
    assertOneOf(assignment_type, ASSIGNMENT_TYPES, "assignment type");
    assertOneOf(status, ASSIGNMENT_STATUSES, "assignment status");
    const ok = await orderRepository.updateAssignment(tenantId, id, {
      assigned_to,
      assignment_type,
      status,
    });
    if (!ok) return null;
    const rows = await orderRepository.listAssignments(tenantId);
    return rows.find((r) => r.id === id) || null;
  },

  deleteAssignment(tenantId, id) {
    return orderRepository.deleteAssignment(tenantId, id);
  },

  // Payments
  listPayments(tenantId) {
    return orderRepository.listPayments(tenantId);
  },

  paymentSummary(tenantId) {
    return orderRepository.paymentSummary(tenantId);
  },

  listPaymentTransactions(tenantId) {
    return orderRepository.listPaymentTransactions(tenantId);
  },

  listPaymentsForOrder(tenantId, orderId) {
    return orderRepository.listPaymentsForOrder(tenantId, orderId);
  },

  async createPayment(tenantId, body) {
    await assertOrderExists(tenantId, body.order_id);
    const bank = Number(body.bank) || 0;
    const cash = Number(body.cash) || 0;
    const amount = Number(body.amount) || bank + cash;
    if (amount <= 0) throw new Error("Enter an amount to add.");
    const order = await orderRepository.getOrder(tenantId, body.order_id);
    const paid = await orderRepository.sumPaymentsForOrder(tenantId, body.order_id);
    const payable = Number(order?.payable_amount) || 0;
    if (paid + amount > payable + 0.001) {
      throw new Error(`Total cannot exceed ${payable - paid} remaining for this order.`);
    }
    const payment_status = body.payment_status || "paid";
    const paid_at = body.paid_at || new Date();
    const id = await orderRepository.createPayment(tenantId, {
      order_id: Number(body.order_id),
      bank,
      cash,
      amount,
      payment_status,
      paid_at,
    });
    await syncOrderPaymentStatus(tenantId, body.order_id);
    const rows = await orderRepository.listPayments(tenantId);
    return rows.find((r) => r.id === id);
  },

  async updatePayment(tenantId, id, body) {
    const rows = await orderRepository.listPayments(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return null;
    const bank = Number(body.bank ?? existing.bank) || 0;
    const cash = Number(body.cash ?? existing.cash) || 0;
    const amount = bank + cash;
    const order = await orderRepository.getOrder(tenantId, existing.order_id);
    const otherPaid = await orderRepository.sumPaymentsForOrder(tenantId, existing.order_id);
    const existingAmount = Number(existing.amount) || 0;
    const payable = Number(order?.payable_amount) || 0;
    const maxAllowed = payable - (otherPaid - existingAmount);
    if (amount > maxAllowed + 0.001) {
      throw new Error(`Total cannot exceed ${maxAllowed} for this order.`);
    }
    const payment_status = body.payment_status || existing.payment_status || "paid";
    const paid_at = body.paid_at ?? existing.paid_at ?? new Date();
    const ok = await orderRepository.updatePayment(tenantId, id, {
      bank,
      cash,
      amount,
      payment_status,
      paid_at,
    });
    if (!ok) return null;
    await syncOrderPaymentStatus(tenantId, existing.order_id);
    const updated = await orderRepository.listPayments(tenantId);
    return updated.find((r) => r.id === id) || null;
  },

  async deletePayment(tenantId, id) {
    const rows = await orderRepository.listPayments(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return false;
    const ok = await orderRepository.deletePayment(tenantId, id);
    if (ok) await syncOrderPaymentStatus(tenantId, existing.order_id);
    return ok;
  },

  // Cancellations
  listCancellations(tenantId) {
    return orderRepository.listCancellations(tenantId);
  },

  async createCancellation(tenantId, userId, body) {
    await assertOrderExists(tenantId, body.order_id);
    const reason = body.reason ? String(body.reason).trim() : null;
    const id = await orderRepository.createCancellation(tenantId, userId, {
      order_id: Number(body.order_id),
      reason,
    });
    const rows = await orderRepository.listCancellations(tenantId);
    return rows.find((r) => r.id === id);
  },

  // Returns
  listReturns(tenantId) {
    return orderRepository.listReturns(tenantId);
  },

  async createReturn(tenantId, userId, body) {
    await assertOrderExists(tenantId, body.order_id);
    const return_status = body.return_status || "requested";
    assertOneOf(return_status, RETURN_STATUSES, "return status");
    const reason = body.reason ? String(body.reason).trim() : null;
    const id = await orderRepository.createReturn(tenantId, userId, {
      order_id: Number(body.order_id),
      return_status,
      reason,
    });
    const rows = await orderRepository.listReturns(tenantId);
    return rows.find((r) => r.id === id);
  },

  async updateReturn(tenantId, id, body) {
    const return_status = body.return_status || "requested";
    assertOneOf(return_status, RETURN_STATUSES, "return status");
    const ok = await orderRepository.updateReturn(tenantId, id, {
      reason: body.reason ? String(body.reason).trim() : null,
      return_status,
    });
    if (!ok) return null;
    const rows = await orderRepository.listReturns(tenantId);
    return rows.find((r) => r.id === id) || null;
  },

  // Exchanges
  listExchanges(tenantId) {
    return orderRepository.listExchanges(tenantId);
  },

  async createExchange(tenantId, userId, body) {
    await assertOrderExists(tenantId, body.order_id);
    const exchange_status = body.exchange_status || "requested";
    assertOneOf(exchange_status, EXCHANGE_STATUSES, "exchange status");
    const old_product_id = toNumber(body.old_product_id, "old product", { min: 1 });
    const new_product_id = toNumber(body.new_product_id, "new product", { min: 1 });
    const id = await orderRepository.createExchange(tenantId, userId, {
      order_id: Number(body.order_id),
      exchange_status,
      reason: body.reason ? String(body.reason).trim() : null,
      old_product_id,
      new_product_id,
    });
    const rows = await orderRepository.listExchanges(tenantId);
    return rows.find((r) => r.id === id);
  },

  async updateExchange(tenantId, id, body) {
    const exchange_status = body.exchange_status || "requested";
    assertOneOf(exchange_status, EXCHANGE_STATUSES, "exchange status");
    const ok = await orderRepository.updateExchange(tenantId, id, {
      reason: body.reason ? String(body.reason).trim() : null,
      exchange_status,
      old_product_id: toNumber(body.old_product_id, "old product", { min: 1 }),
      new_product_id: toNumber(body.new_product_id, "new product", { min: 1 }),
    });
    if (!ok) return null;
    const rows = await orderRepository.listExchanges(tenantId);
    return rows.find((r) => r.id === id) || null;
  },

  // Refunds
  listRefunds(tenantId) {
    return orderRepository.listRefunds(tenantId);
  },

  async createRefund(tenantId, userId, body) {
    await assertOrderExists(tenantId, body.order_id);
    const refund_status = body.refund_status || "pending";
    const refund_method = body.refund_method || "original_payment";
    assertOneOf(refund_status, REFUND_STATUSES, "refund status");
    assertOneOf(refund_method, REFUND_METHODS, "refund method");
    const refund_amount = toNumber(body.refund_amount, "refund amount", { min: 0 });
    const refunded_at = refund_status === "processed" ? (body.refunded_at || new Date()) : body.refunded_at || null;
    const id = await orderRepository.createRefund(tenantId, userId, {
      order_id: Number(body.order_id),
      refund_amount,
      refund_method,
      refund_status,
      reason: body.reason ? String(body.reason).trim() : null,
      refunded_at,
    });
    const rows = await orderRepository.listRefunds(tenantId);
    return rows.find((r) => r.id === id);
  },

  async updateRefund(tenantId, id, body) {
    const rows = await orderRepository.listRefunds(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return null;
    const refund_status = body.refund_status || existing.refund_status;
    const refund_method = body.refund_method || existing.refund_method;
    assertOneOf(refund_status, REFUND_STATUSES, "refund status");
    assertOneOf(refund_method, REFUND_METHODS, "refund method");
    const ok = await orderRepository.updateRefund(tenantId, id, {
      refund_amount: toNumber(body.refund_amount ?? existing.refund_amount, "refund amount", { min: 0 }),
      refund_method,
      refund_status,
      reason: body.reason != null ? String(body.reason).trim() : existing.reason,
      refunded_at: refund_status === "processed" ? (body.refunded_at || existing.refunded_at || new Date()) : body.refunded_at ?? null,
    });
    if (!ok) return null;
    const updated = await orderRepository.listRefunds(tenantId);
    return updated.find((r) => r.id === id) || null;
  },
};
