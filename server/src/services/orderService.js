import { orderRepository } from "../repositories/orderRepository.js";
import { financeRepository } from "../repositories/financeRepository.js";
import { crmService } from "./crmService.js";
import { crmRepository } from "../repositories/crmRepository.js";
import { cascadeSoftDeleteOrder } from "../utils/orderSoftDelete.js";
import {
  syncEntityToShopify,
  pushEntityToShopify,
  deleteLinkedOrderFromShopify,
  pushOrderPaymentToShopify,
  pushOrderRefundToShopify,
  pushOrderReturnToShopify,
  pushOrderExchangeToShopify,
} from "./ecommerce/ecomPush.js";
import { requireShopifySync, requireShopifySyncIfLinked } from "./ecommerce/shopifySyncGuard.js";
import {
  assertOrderStatusEditable,
  assertRequireShopifySyncOnSave,
  assertShopifyOrderLineItemsEditable,
  assertShopifyPaymentAllowed,
  assertShopifyPaymentMutationAllowed,
  assertShopifyRefundAllowed,
  assertShopifyReturnBlocked,
  assertShopifyExchangeBlocked,
  isShopifyLinked,
} from "./ecommerce/shopifyPolicy.js";
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
import { parseDashboardFilterQuery } from "../utils/dashboardDateFilter.js";
import { organizationSettingsRepository } from "../repositories/organizationSettingsRepository.js";

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

function orderItemsFingerprint(items) {
  const rows = (items || []).map((item) => ({
    product_id: item.product_id ?? null,
    sku: String(item.sku || "").trim(),
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.unit_price) || 0,
    discount: Number(item.discount) || 0,
  }));
  rows.sort((a, b) => `${a.sku}-${a.product_id}`.localeCompare(`${b.sku}-${b.product_id}`));
  return JSON.stringify(rows);
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

function truthyFlag(value) {
  return value === true || value === 1 || value === "1";
}

function orderAfterSalesFlags(order) {
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

function assertCanCancel(order) {
  const flags = orderAfterSalesFlags(order);
  if (flags.cancelled || flags.hasCancellation) {
    throw new Error("This order is already cancelled.");
  }
  if (flags.hasReturn || flags.returned) {
    throw new Error("This order already has a return recorded.");
  }
  if (flags.hasExchange) {
    throw new Error("This order already has an exchange recorded.");
  }
  if (flags.hasRefund || flags.refunded) {
    throw new Error("This order already has a refund recorded.");
  }
}

function assertCanReturn(order) {
  const flags = orderAfterSalesFlags(order);
  if (flags.cancelled || flags.hasCancellation) {
    throw new Error("Cancelled orders cannot be returned.");
  }
  if (flags.hasReturn || flags.returned) {
    throw new Error("This order already has a return recorded.");
  }
  if (flags.hasExchange) {
    throw new Error("This order already has an exchange recorded.");
  }
  if (flags.hasRefund || flags.refunded) {
    throw new Error("This order already has a refund recorded.");
  }
}

function assertCanExchange(order) {
  const flags = orderAfterSalesFlags(order);
  if (flags.cancelled || flags.hasCancellation) {
    throw new Error("Cancelled orders cannot be exchanged.");
  }
  if (flags.hasReturn || flags.returned) {
    throw new Error("This order already has a return recorded.");
  }
  if (flags.hasExchange) {
    throw new Error("This order already has an exchange recorded.");
  }
  if (flags.hasRefund || flags.refunded) {
    throw new Error("This order already has a refund recorded.");
  }
}

function assertCanRefund(order) {
  const flags = orderAfterSalesFlags(order);
  if (flags.hasRefund || flags.refunded) {
    throw new Error("This order already has a refund recorded.");
  }
  if (flags.hasExchange) {
    throw new Error("This order already has an exchange recorded.");
  }
  if (flags.hasReturn || flags.returned) {
    throw new Error("This order already has a return recorded.");
  }
  const paid = ["paid", "partial", "partially_paid"].includes(String(order.payment_status || "").toLowerCase());
  if (!paid) {
    throw new Error("Only paid or partially paid orders can be refunded.");
  }
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

// When an order's status transitions to a terminal after-sales state, mirror it
// into the matching after-sales table so those pages stay the source of truth.
async function syncAfterSalesFromStatus(tenantId, userId, orderId, order) {
  const orderStatus = String(order.order_status || "").toLowerCase();
  const paymentStatus = String(order.payment_status || "").toLowerCase();

  if (orderStatus === "cancelled") {
    const rows = await orderRepository.listCancellations(tenantId);
    if (!rows.some((r) => Number(r.order_id) === Number(orderId))) {
      await orderRepository.createCancellation(tenantId, userId, {
        order_id: Number(orderId),
        reason: "Auto-recorded from order status change",
      });
    }
  }

  if (orderStatus === "returned") {
    const rows = await orderRepository.listReturns(tenantId);
    if (!rows.some((r) => Number(r.order_id) === Number(orderId))) {
      await orderRepository.createReturn(tenantId, userId, {
        order_id: Number(orderId),
        return_status: "requested",
        reason: "Auto-recorded from order status change",
      });
    }
  }

  if (paymentStatus === "refunded") {
    const rows = await orderRepository.listRefunds(tenantId);
    if (!rows.some((r) => Number(r.order_id) === Number(orderId))) {
      await orderRepository.createRefund(tenantId, userId, {
        order_id: Number(orderId),
        refund_amount: Number(order.payable_amount) || 0,
        refund_method: "original_payment",
        refund_status: "processed",
        reason: "Auto-recorded from payment status change",
        refunded_at: new Date(),
      });
    }
  }
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
    delivery_state: body.delivery_state ? String(body.delivery_state).trim() : null,
    delivery_postal_code: body.delivery_postal_code ? String(body.delivery_postal_code).trim() : null,
    delivery_country: body.delivery_country ? String(body.delivery_country).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    tags: body.tags ? String(body.tags).trim() : null,
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
  async dashboard(tenantId, query = {}) {
    const org = await organizationSettingsRepository.getByTenant(tenantId);
    const filter = {
      ...parseDashboardFilterQuery(query),
      fiscalYearStart: org?.fiscal_year_start || null,
    };
    const stats = await orderRepository.dashboardStats(tenantId, filter);
    return {
      stats,
      orders_by_status: await orderRepository.dashboardOrdersByStatus(tenantId, filter),
      fulfillment_by_status: await orderRepository.dashboardFulfillmentByStatus(tenantId, filter),
      payment_by_status: await orderRepository.dashboardPaymentByStatus(tenantId, filter),
      orders_by_month: await orderRepository.dashboardOrdersByMonth(tenantId, filter),
      recent_orders: await orderRepository.dashboardRecentOrders(tenantId, filter),
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

  async warehouseProducts(tenantId, warehouseId, options = {}) {
    return orderRepository.listWarehouseProducts(tenantId, warehouseId, options);
  },

  async lookupCustomerByPhone(tenantId, phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length < 4) return null;
    const customers = await orderRepository.listCustomers(tenantId);
    const match = customers.find((c) => String(c.phone || "").replace(/\D/g, "") === digits);
    if (!match) return null;
    return this.getCustomerDetail(tenantId, match.id);
  },

  async getCustomerDetail(tenantId, id) {
    const customer = await crmRepository.getCustomer(tenantId, id);
    if (!customer) return null;
    const defaultAddr = (customer.addresses || []).find((a) => a.is_default) || customer.addresses?.[0] || null;
    return {
      id: customer.id,
      customer_name: customer.customer_name || "",
      company_name: customer.company_name || "",
      customer_type: customer.customer_type || "retailer",
      status: customer.status || "active",
      phone: customer.phone || "",
      email: customer.email || "",
      note: customer.note || "",
      tags: (customer.tags || []).map((t) => t.tag_name).filter(Boolean),
      city: defaultAddr?.city || "",
      delivery_address: defaultAddr?.address || "",
      delivery_state: defaultAddr?.state || "",
      delivery_postal_code: defaultAddr?.postal_code || "",
      delivery_country: defaultAddr?.country || "",
      address_id: defaultAddr?.id || null,
    };
  },

  _customerBodyFromOrder(body) {
    return {
      customer_name: requireString(body.customer_name, "Customer name"),
      company_name: body.company_name ? String(body.company_name).trim() : null,
      customer_type: body.customer_type ? String(body.customer_type).trim() : "retailer",
      status: body.status ? String(body.status).trim() : "active",
      phone: body.phone ? String(body.phone).trim() : null,
      email: body.email ? String(body.email).trim() : null,
      note: body.note ? String(body.note).trim() : null,
      tags: Array.isArray(body.tags)
        ? body.tags
        : String(body.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    };
  },

  async quickCreateCustomer(tenantId, userId, body) {
    const addresses = [];
    if (body.city || body.delivery_address || body.delivery_state || body.delivery_postal_code || body.delivery_country) {
      addresses.push({
        address_type: "default",
        address: body.delivery_address || null,
        city: body.city || null,
        state: body.delivery_state || null,
        postal_code: body.delivery_postal_code || null,
        country: body.delivery_country || null,
        is_default: true,
      });
    }
    return crmService.createCustomer(tenantId, userId, {
      ...this._customerBodyFromOrder(body),
      source: "order",
      addresses,
      syncToShopify: Boolean(body.syncToShopify),
    });
  },

  async quickUpdateCustomer(tenantId, userId, id, body) {
    const existing = await crmRepository.getCustomer(tenantId, id);
    if (!existing) throw new Error("Customer not found");
    const syncToShopify = Boolean(body.syncToShopify);
    // Save locally first (including address) so Shopify push sees full profile.
    await crmService.updateCustomer(tenantId, userId, id, {
      ...this._customerBodyFromOrder(body),
      syncToShopify: false,
      allowLocalLinkedUpdate: true,
    });
    if (body.city || body.delivery_address || body.delivery_state || body.delivery_postal_code || body.delivery_country) {
      const refreshed = await crmRepository.getCustomer(tenantId, id);
      const defaultAddr = (refreshed.addresses || []).find((a) => a.is_default) || refreshed.addresses?.[0] || null;
      const addrData = {
        address_type: "default",
        address: body.delivery_address || null,
        city: body.city || null,
        state: body.delivery_state || null,
        postal_code: body.delivery_postal_code || null,
        country: body.delivery_country || null,
        is_default: 1,
      };
      if (defaultAddr?.id) {
        await crmRepository.updateAddress(tenantId, defaultAddr.id, addrData).catch(() => {});
      } else {
        await crmRepository.createAddress(tenantId, id, addrData).catch(() => {});
      }
    }
    if (syncToShopify) {
      const push = await syncEntityToShopify(tenantId, "customer", id);
      requireShopifySync(push, "Customer");
    }
    return this.getCustomerDetail(tenantId, id);
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
    await syncAfterSalesFromStatus(tenantId, userId, orderId, data);
    const order = await orderRepository.getOrder(tenantId, orderId);
    if (!body.syncToShopify) return order;
    try {
      const push = await syncEntityToShopify(tenantId, "order", orderId);
      requireShopifySync(push, "Order");
      return { ...order, shopifySync: push };
    } catch (err) {
      await cascadeSoftDeleteOrder(orderId, tenantId);
      throw err;
    }
  },

  async updateOrder(tenantId, id, body, userId = null) {
    const existing = await orderRepository.getOrder(tenantId, id);
    if (!existing) return null;
    assertOrderStatusEditable(existing);
    await assertRequireShopifySyncOnSave(tenantId, "order", id, body.syncToShopify);
    const linked = await isShopifyLinked(tenantId, "order", id);
    const before = linked || body.syncToShopify ? await orderRepository.getOrder(tenantId, id) : null;
    const items = body.items ? normalizeItems(body.items) : existing.items;
    const itemsChanged = body.items != null
      && orderItemsFingerprint(before?.items ?? existing.items) !== orderItemsFingerprint(items);
    if (itemsChanged) {
      await assertShopifyOrderLineItemsEditable(
        tenantId,
        existing,
        before?.items ?? existing.items,
        items,
      );
    }
    const data = await mapOrderPayload(tenantId, { ...existing, ...body }, items);
    const ok = await orderRepository.updateOrder(tenantId, id, data);
    if (!ok) return null;
    if (body.items && itemsChanged) await orderRepository.replaceOrderItems(tenantId, id, items);
    await syncAfterSalesFromStatus(tenantId, userId, id, data);
    const updated = await orderRepository.getOrder(tenantId, id);
    if (!body.syncToShopify) return updated;
    try {
      const push = await syncEntityToShopify(tenantId, "order", id, {
        skipOrderLineItems: !itemsChanged,
        beforeOrder: before,
      });
      requireShopifySync(push, "Order");
      return { ...updated, shopifySync: push };
    } catch (err) {
      if (before) {
        const prevItems = normalizeItems(
          (before.items || []).map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            sku: item.sku,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount,
            total_price: item.total_price,
          })),
        );
        const prevData = await mapOrderPayload(
          tenantId,
          {
            order_source: before.order_source,
            order_status: before.order_status,
            payment_status: before.payment_status,
            fulfillment_status: before.fulfillment_status,
            discount_amount: before.discount_amount,
            delivery_charges: before.delivery_charges,
            city: before.city,
            delivery_address: before.delivery_address,
            delivery_state: before.delivery_state,
            delivery_postal_code: before.delivery_postal_code,
            delivery_country: before.delivery_country,
            notes: before.notes,
            tags: before.tags,
            customer_id: before.customer_id,
          },
          prevItems,
        );
        await orderRepository.updateOrder(tenantId, id, prevData);
        await orderRepository.replaceOrderItems(tenantId, id, prevItems);
      }
      throw err;
    }
  },

  async deleteOrder(tenantId, id) {
    const shopifySync = await deleteLinkedOrderFromShopify(tenantId, id);
    try {
      requireShopifySyncIfLinked(shopifySync, "Order");
    } catch (err) {
      const detail = shopifySync?.error || shopifySync?.reason || err.message;
      const error = new Error(
        `Order was not deleted. Cancel it in Shopify first, or fix sync: ${detail}`,
      );
      error.status = 409;
      throw error;
    }
    const deleted = await cascadeSoftDeleteOrder(id, tenantId);
    return { deleted, shopifySync };
  },

  async exportOrders(tenantId) {
    const orders = await orderRepository.listOrders(tenantId);
    const out = [];
    for (const o of orders) {
      const full = await orderRepository.getOrder(tenantId, o.id);
      const items = full?.items || [];
      const base = {
        order_no: o.order_no,
        customer_name: o.customer_name || "",
        order_source: o.order_source,
        order_status: o.order_status,
        payment_status: o.payment_status,
        fulfillment_status: o.fulfillment_status,
        discount_amount: o.discount_amount,
        delivery_charges: o.delivery_charges,
        payable_amount: o.payable_amount,
        city: o.city || "",
        delivery_address: o.delivery_address || "",
        payment_method: o.payment_method || "",
        notes: o.notes || "",
        created_at: o.created_at,
      };
      if (items.length) {
        // One row per line item so product details are included in the export.
        for (const item of items) {
          out.push({
            ...base,
            product_name: item.product_name || "",
            sku: item.sku || "",
            quantity: item.quantity ?? "",
            unit_price: item.unit_price ?? "",
            item_discount: item.discount ?? 0,
            item_total: item.total_price ?? "",
          });
        }
      } else {
        out.push({
          ...base,
          product_name: "",
          sku: "",
          quantity: "",
          unit_price: "",
          item_discount: "",
          item_total: "",
        });
      }
    }
    return out;
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
    await assertShopifyPaymentAllowed(tenantId, body.order_id);
    const amount = Number(body.amount) || 0;
    if (amount <= 0) throw new Error("Enter an amount to add.");
    const payment_method = body.payment_method || "cash";
    let bank_account_id = null;
    if (payment_method === "bank_transfer") {
      bank_account_id = Number(body.bank_account_id);
      if (!bank_account_id) throw new Error("Select the bank account that received this payment.");
      const account = await financeRepository.getBankAccount(tenantId, bank_account_id);
      if (!account) throw new Error("Bank account not found");
    }
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
      payment_method,
      bank_account_id,
      amount,
      payment_status,
      paid_at,
    });
    if (bank_account_id) {
      await financeRepository.adjustBankBalance(tenantId, bank_account_id, amount);
    }
    await syncOrderPaymentStatus(tenantId, body.order_id);
    try {
      const push = await pushOrderPaymentToShopify(tenantId, Number(body.order_id), {
        amount,
        payment_method,
      });
      requireShopifySyncIfLinked(push, "Order payment");
    } catch (err) {
      await orderRepository.deletePayment(tenantId, id);
      if (bank_account_id) {
        await financeRepository.adjustBankBalance(tenantId, bank_account_id, -amount);
      }
      await syncOrderPaymentStatus(tenantId, body.order_id);
      throw err;
    }
    const rows = await orderRepository.listPayments(tenantId);
    return rows.find((r) => r.id === id);
  },

  async updatePayment(tenantId, id, body) {
    const rows = await orderRepository.listPayments(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return null;
    await assertShopifyPaymentMutationAllowed(tenantId, existing.order_id);
    const amount = Number(body.amount ?? existing.amount) || 0;
    const payment_method = body.payment_method ?? existing.payment_method ?? "cash";
    let bank_account_id = null;
    if (payment_method === "bank_transfer") {
      bank_account_id = Number(body.bank_account_id ?? existing.bank_account_id);
      if (!bank_account_id) throw new Error("Select the bank account that received this payment.");
      const account = await financeRepository.getBankAccount(tenantId, bank_account_id);
      if (!account) throw new Error("Bank account not found");
    }
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
    const oldBankId = existing.bank_account_id ? Number(existing.bank_account_id) : null;
    const oldAmount = Number(existing.amount) || 0;
    const ok = await orderRepository.updatePayment(tenantId, id, {
      payment_method,
      bank_account_id,
      amount,
      payment_status,
      paid_at,
    });
    if (!ok) return null;
    if (oldBankId) {
      await financeRepository.adjustBankBalance(tenantId, oldBankId, -oldAmount);
    }
    if (bank_account_id) {
      await financeRepository.adjustBankBalance(tenantId, bank_account_id, amount);
    }
    await syncOrderPaymentStatus(tenantId, existing.order_id);
    const updated = await orderRepository.listPayments(tenantId);
    return updated.find((r) => r.id === id) || null;
  },

  async deletePayment(tenantId, id) {
    const rows = await orderRepository.listPayments(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return false;
    await assertShopifyPaymentMutationAllowed(tenantId, existing.order_id);
    const ok = await orderRepository.deletePayment(tenantId, id);
    if (ok) {
      if (existing.bank_account_id) {
        await financeRepository.adjustBankBalance(
          tenantId,
          Number(existing.bank_account_id),
          -(Number(existing.amount) || 0)
        );
      }
      await syncOrderPaymentStatus(tenantId, existing.order_id);
    }
    return ok;
  },

  // Cancellations
  listCancellations(tenantId) {
    return orderRepository.listCancellations(tenantId);
  },

  async createCancellation(tenantId, userId, body) {
    const order = await assertOrderExists(tenantId, body.order_id);
    assertCanCancel(order);
    const reason = body.reason ? String(body.reason).trim() : null;
    const previousOrderStatus = order.order_status;
    const id = await orderRepository.createCancellation(tenantId, userId, {
      order_id: Number(body.order_id),
      reason,
    });
    try {
      const push = await pushEntityToShopify(tenantId, "order", Number(body.order_id));
      requireShopifySyncIfLinked(push, "Order");
    } catch (err) {
      await orderRepository.revertCancellation(tenantId, id, Number(body.order_id), previousOrderStatus);
      throw err;
    }
    const rows = await orderRepository.listCancellations(tenantId);
    return rows.find((r) => r.id === id);
  },

  // Returns
  listReturns(tenantId) {
    return orderRepository.listReturns(tenantId);
  },

  async createReturn(tenantId, userId, body) {
    const order = await assertOrderExists(tenantId, body.order_id);
    await assertShopifyReturnBlocked(tenantId, body.order_id);
    assertCanReturn(order);
    const return_status = body.return_status || "requested";
    assertOneOf(return_status, RETURN_STATUSES, "return status");
    const reason = body.reason ? String(body.reason).trim() : null;
    const previousOrderStatus = order.order_status;
    const id = await orderRepository.createReturn(tenantId, userId, {
      order_id: Number(body.order_id),
      return_status,
      reason,
    });
    const rows = await orderRepository.listReturns(tenantId);
    const created = rows.find((r) => r.id === id);
    try {
      if (created) {
        const returnPush = await pushOrderReturnToShopify(tenantId, Number(body.order_id), created);
        requireShopifySyncIfLinked(returnPush, "Order return");
        const orderPush = await syncEntityToShopify(tenantId, "order", Number(body.order_id), { skipOrderLineItems: true });
        requireShopifySyncIfLinked(orderPush, "Order");
      }
    } catch (err) {
      await orderRepository.revertReturn(tenantId, id, Number(body.order_id), previousOrderStatus);
      throw err;
    }
    return created;
  },

  async updateReturn(tenantId, id, body) {
    const rows = await orderRepository.listReturns(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return null;
    await assertShopifyReturnBlocked(tenantId, existing.order_id);
    const return_status = body.return_status || "requested";
    assertOneOf(return_status, RETURN_STATUSES, "return status");
    const before = {
      reason: existing.reason,
      return_status: existing.return_status,
    };
    const ok = await orderRepository.updateReturn(tenantId, id, {
      reason: body.reason ? String(body.reason).trim() : null,
      return_status,
    });
    if (!ok) return null;
    const updatedRows = await orderRepository.listReturns(tenantId);
    const row = updatedRows.find((r) => r.id === id) || null;
    try {
      if (row) {
        const push = await pushOrderReturnToShopify(tenantId, Number(row.order_id), row);
        requireShopifySyncIfLinked(push, "Order return");
      }
    } catch (err) {
      await orderRepository.updateReturn(tenantId, id, before);
      throw err;
    }
    return row;
  },

  // Exchanges
  listExchanges(tenantId) {
    return orderRepository.listExchanges(tenantId);
  },

  async createExchange(tenantId, userId, body) {
    const order = await assertOrderExists(tenantId, body.order_id);
    await assertShopifyExchangeBlocked(tenantId, body.order_id);
    assertCanExchange(order);
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
    const created = rows.find((r) => r.id === id);
    try {
      if (created) {
        const push = await pushOrderExchangeToShopify(tenantId, Number(body.order_id), created);
        requireShopifySyncIfLinked(push, "Order exchange");
      }
    } catch (err) {
      await orderRepository.revertExchange(tenantId, id);
      throw err;
    }
    return created;
  },

  async updateExchange(tenantId, id, body) {
    const rows = await orderRepository.listExchanges(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return null;
    await assertShopifyExchangeBlocked(tenantId, existing.order_id);
    const exchange_status = body.exchange_status || "requested";
    assertOneOf(exchange_status, EXCHANGE_STATUSES, "exchange status");
    const before = {
      reason: existing.reason,
      exchange_status: existing.exchange_status,
      old_product_id: existing.old_product_id,
      new_product_id: existing.new_product_id,
    };
    const ok = await orderRepository.updateExchange(tenantId, id, {
      reason: body.reason ? String(body.reason).trim() : null,
      exchange_status,
      old_product_id: toNumber(body.old_product_id, "old product", { min: 1 }),
      new_product_id: toNumber(body.new_product_id, "new product", { min: 1 }),
    });
    if (!ok) return null;
    const updatedRows = await orderRepository.listExchanges(tenantId);
    const row = updatedRows.find((r) => r.id === id) || null;
    try {
      if (row) {
        const push = await pushOrderExchangeToShopify(tenantId, Number(row.order_id), row);
        requireShopifySyncIfLinked(push, "Order exchange");
      }
    } catch (err) {
      await orderRepository.updateExchange(tenantId, id, before);
      throw err;
    }
    return row;
  },

  // Refunds
  listRefunds(tenantId) {
    return orderRepository.listRefunds(tenantId);
  },

  async createRefund(tenantId, userId, body) {
    const order = await assertOrderExists(tenantId, body.order_id);
    assertCanRefund(order);
    const refund_status = body.refund_status || "pending";
    const refund_method = body.refund_method || "original_payment";
    assertOneOf(refund_status, REFUND_STATUSES, "refund status");
    assertOneOf(refund_method, REFUND_METHODS, "refund method");
    const refund_amount = toNumber(body.refund_amount, "refund amount", { min: 0 });
    const refunded_at = refund_status === "processed" ? (body.refunded_at || new Date()) : body.refunded_at || null;
    const previousPaymentStatus = order.payment_status;
    const id = await orderRepository.createRefund(tenantId, userId, {
      order_id: Number(body.order_id),
      refund_amount,
      refund_method,
      refund_status,
      reason: body.reason ? String(body.reason).trim() : null,
      refunded_at,
    });
    const rows = await orderRepository.listRefunds(tenantId);
    const created = rows.find((r) => r.id === id);
    if (refund_status === "processed") {
      await assertShopifyRefundAllowed(tenantId, Number(body.order_id));
      try {
        const refundPush = await pushOrderRefundToShopify(tenantId, Number(body.order_id), {
          refund_amount,
          reason: body.reason ? String(body.reason).trim() : null,
        });
        requireShopifySyncIfLinked(refundPush, "Order refund");
        const orderPush = await syncEntityToShopify(tenantId, "order", Number(body.order_id), { skipOrderLineItems: true });
        requireShopifySyncIfLinked(orderPush, "Order");
      } catch (err) {
        await orderRepository.revertRefund(tenantId, id, Number(body.order_id), previousPaymentStatus);
        throw err;
      }
    }
    return created;
  },

  async updateRefund(tenantId, id, body) {
    const rows = await orderRepository.listRefunds(tenantId);
    const existing = rows.find((r) => r.id === id);
    if (!existing) return null;
    const refund_status = body.refund_status || existing.refund_status;
    const refund_method = body.refund_method || existing.refund_method;
    assertOneOf(refund_status, REFUND_STATUSES, "refund status");
    assertOneOf(refund_method, REFUND_METHODS, "refund method");
    const before = {
      refund_amount: existing.refund_amount,
      refund_method: existing.refund_method,
      refund_status: existing.refund_status,
      reason: existing.reason,
      refunded_at: existing.refunded_at,
    };
    const ok = await orderRepository.updateRefund(tenantId, id, {
      refund_amount: toNumber(body.refund_amount ?? existing.refund_amount, "refund amount", { min: 0 }),
      refund_method,
      refund_status,
      reason: body.reason != null ? String(body.reason).trim() : existing.reason,
      refunded_at: refund_status === "processed" ? (body.refunded_at || existing.refunded_at || new Date()) : body.refunded_at ?? null,
    });
    if (!ok) return null;
    const updated = await orderRepository.listRefunds(tenantId);
    const row = updated.find((r) => r.id === id) || null;
    if (
      row
      && refund_status === "processed"
      && String(existing.refund_status || "").toLowerCase() !== "processed"
    ) {
      await assertShopifyRefundAllowed(tenantId, Number(existing.order_id));
      try {
        const refundPush = await pushOrderRefundToShopify(tenantId, Number(existing.order_id), {
          refund_amount: row.refund_amount,
          reason: row.reason,
        });
        requireShopifySyncIfLinked(refundPush, "Order refund");
        const orderPush = await syncEntityToShopify(tenantId, "order", Number(existing.order_id), { skipOrderLineItems: true });
        requireShopifySyncIfLinked(orderPush, "Order");
      } catch (err) {
        await orderRepository.updateRefund(tenantId, id, before);
        throw err;
      }
    }
    return row;
  },
};
