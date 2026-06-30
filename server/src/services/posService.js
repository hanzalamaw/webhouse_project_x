import { posRepository } from "../repositories/posRepository.js";
import { posInventoryService } from "./posInventoryService.js";
import {
  POS_MODULE,
  OUTLET_STATUSES,
  TERMINAL_STATUSES,
} from "../utils/posConstants.js";
import { resolveOpeningBalance, formatTime12 } from "../utils/posDrawer.js";

function normalizeTime(value, label) {
  if (value == null || value === "") return null;
  const v = String(value).trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) {
    throw new Error(`Invalid ${label}. Use HH:MM format.`);
  }
  const parts = v.split(":");
  const hh = parts[0].padStart(2, "0");
  const mm = parts[1].padStart(2, "0");
  const ss = parts[2] ? parts[2].padStart(2, "0") : "00";
  return `${hh}:${mm}:${ss}`;
}

function outletPayload(body, existing = {}) {
  return {
    outlet_name: body.outlet_name ?? existing.outlet_name,
    location: body.location ?? existing.location,
    city: body.city ?? existing.city,
    status: body.status ?? existing.status,
    store_open_time: body.store_open_time !== undefined
      ? normalizeTime(body.store_open_time, "Store open time")
      : existing.store_open_time,
    store_close_time: body.store_close_time !== undefined
      ? normalizeTime(body.store_close_time, "Store close time")
      : existing.store_close_time,
    opening_balance: body.opening_balance !== undefined
      ? Number(body.opening_balance) || 0
      : Number(existing.opening_balance) || 0,
  };
}

async function assertUniqueTerminalCode(tenantId, deviceCode, excludeId = null) {
  const code = String(deviceCode || "").trim();
  const existing = await posRepository.findTerminalByDeviceCode(tenantId, code, excludeId);
  if (existing) {
    throw new Error("A terminal with this terminal code already exists for your account.");
  }
}

async function assertUniqueOutletName(tenantId, outletName, excludeId = null) {
  const name = String(outletName || "").trim();
  const existing = await posRepository.findOutletByName(tenantId, name, excludeId);
  if (existing) {
    throw new Error("A store with this name already exists for your account.");
  }
}

async function ensureActiveRegister(tenantId, userId, terminal) {
  const now = new Date();
  let register = await posRepository.getOpenRegister(tenantId, terminal.id);
  const storeOpenTime = terminal.store_open_time;
  let drawerMeta = { resetApplied: false, resetAt: null };

  if (!register) {
    const lastClosed = await posRepository.getLastClosedRegister(tenantId, terminal.id);
    const resolved = resolveOpeningBalance({
      now,
      storeOpenTime,
      lastClosedRegister: lastClosed,
      defaultOpeningBalance: terminal.store_opening_balance ?? terminal.opening_balance ?? 0,
    });
    register = await posRepository.openRegister(tenantId, userId, terminal, resolved.openingBalance);
    drawerMeta = {
      resetApplied: resolved.resetApplied,
      resetAt: resolved.resetAt,
    };
  }

  return { register, drawerMeta };
}

function drawerInfo(terminal, drawerMeta) {
  return {
    store_open_time: terminal.store_open_time,
    store_close_time: terminal.store_close_time,
    store_open_label: formatTime12(terminal.store_open_time),
    store_close_label: formatTime12(terminal.store_close_time),
    reset_applied: Boolean(drawerMeta?.resetApplied),
    reset_at: drawerMeta?.resetAt || null,
  };
}

function requireText(value, label) {
  const v = String(value || "").trim();
  if (!v) throw new Error(`${label} is required`);
  return v;
}

function normalizeStatus(value, allowed, fallback) {
  const v = String(value || fallback).trim().toLowerCase();
  if (!allowed.includes(v)) throw new Error(`Invalid status: ${value}`);
  return v;
}

export const posService = {
  async dashboard(tenantId) {
    const stats = await posRepository.dashboardStats(tenantId);
    const recent_sales = await posRepository.listRecentSales(tenantId, 8);
    return {
      stats: {
        outlet_count: Number(stats.outlet_count) || 0,
        terminal_count: Number(stats.terminal_count) || 0,
        sales_today: Number(stats.sales_today) || 0,
        revenue_today: Number(stats.revenue_today) || 0,
        open_registers: Number(stats.open_registers) || 0,
        total_sales: Number(stats.total_sales) || 0,
      },
      recent_sales,
    };
  },

  async reference(tenantId) {
    return {
      outlets: await posRepository.listOutletsForReference(tenantId),
      outlet_statuses: OUTLET_STATUSES,
      terminal_statuses: TERMINAL_STATUSES,
    };
  },

  listOutlets(tenantId) {
    return posRepository.listOutlets(tenantId);
  },

  async getStoreLimits(tenantId) {
    const max_stores = await posRepository.getTenantStoreLimit(tenantId);
    const store_count = await posRepository.countOutlets(tenantId);
    return {
      max_stores,
      store_count,
      can_create: max_stores <= 0 || store_count < max_stores,
    };
  },

  getOutlet(tenantId, id) {
    return posRepository.getOutlet(tenantId, id);
  },

  async outletDashboard(tenantId, id) {
    return posRepository.outletDashboard(tenantId, id);
  },

  async createOutlet(tenantId, body) {
    const limits = await this.getStoreLimits(tenantId);
    if (!limits.can_create) {
      throw new Error(
        `Store limit reached (${limits.store_count}/${limits.max_stores}). Contact your administrator to increase the limit.`
      );
    }
    const storeOpen = normalizeTime(body.store_open_time, "Store open time");
    if (!storeOpen) throw new Error("Store open time is required");
    const outletName = requireText(body.outlet_name, "Store name");
    await assertUniqueOutletName(tenantId, outletName);
    return posRepository.createOutlet(tenantId, {
      outlet_name: outletName,
      location: body.location || null,
      city: body.city || null,
      status: normalizeStatus(body.status, OUTLET_STATUSES, "active"),
      store_open_time: storeOpen,
      store_close_time: normalizeTime(body.store_close_time, "Store close time"),
      opening_balance: Number(body.opening_balance) || 0,
    });
  },

  async updateOutlet(tenantId, id, body) {
    const existing = await posRepository.getOutlet(tenantId, id);
    if (!existing) return null;
    const payload = outletPayload(body, existing);
    const outletName = requireText(payload.outlet_name ?? existing.outlet_name, "Store name");
    await assertUniqueOutletName(tenantId, outletName, id);
    return posRepository.updateOutlet(tenantId, id, {
      outlet_name: outletName,
      location: payload.location ?? existing.location,
      city: payload.city ?? existing.city,
      status: normalizeStatus(payload.status ?? existing.status, OUTLET_STATUSES, existing.status),
      store_open_time: payload.store_open_time,
      store_close_time: payload.store_close_time,
      opening_balance: payload.opening_balance,
    });
  },

  deleteOutlet(tenantId, id) {
    return posRepository.deleteOutlet(tenantId, id);
  },

  listTerminals(tenantId) {
    return posRepository.listTerminals(tenantId);
  },

  getTerminal(tenantId, id) {
    return posRepository.getTerminal(tenantId, id);
  },

  async createTerminal(tenantId, body) {
    const outletId = Number(body.outlet_id);
    if (!Number.isInteger(outletId) || outletId <= 0) throw new Error("Store is required");
    const outlet = await posRepository.getOutlet(tenantId, outletId);
    if (!outlet) throw new Error("Store not found");
    const deviceCode = requireText(body.device_code, "Terminal code");
    await assertUniqueTerminalCode(tenantId, deviceCode);
    return posRepository.createTerminal(tenantId, {
      terminal_name: requireText(body.terminal_name, "Terminal name"),
      device_code: deviceCode,
      status: normalizeStatus(body.status, TERMINAL_STATUSES, "active"),
      outlet_id: outletId,
    });
  },

  async updateTerminal(tenantId, id, body) {
    const existing = await posRepository.getTerminal(tenantId, id);
    if (!existing) return null;
    const outletId = body.outlet_id != null ? Number(body.outlet_id) : existing.outlet_id;
    if (!Number.isInteger(outletId) || outletId <= 0) throw new Error("Store is required");
    const outlet = await posRepository.getOutlet(tenantId, outletId);
    if (!outlet) throw new Error("Store not found");
    const deviceCode = requireText(body.device_code ?? existing.device_code, "Terminal code");
    await assertUniqueTerminalCode(tenantId, deviceCode, id);
    return posRepository.updateTerminal(tenantId, id, {
      terminal_name: requireText(body.terminal_name ?? existing.terminal_name, "Terminal name"),
      device_code: deviceCode,
      status: normalizeStatus(body.status ?? existing.status, TERMINAL_STATUSES, existing.status),
      outlet_id: outletId,
    });
  },

  deleteTerminal(tenantId, id) {
    return posRepository.deleteTerminal(tenantId, id);
  },

  listSales(tenantId) {
    return posRepository.listSales(tenantId);
  },

  getSale(tenantId, id) {
    return posRepository.getSale(tenantId, id);
  },

  listRegisters(tenantId) {
    return posRepository.listRegisters(tenantId);
  },

  listTerminalBalances(tenantId) {
    return posRepository.listTerminalBalances(tenantId);
  },

  async getTerminalLogs(tenantId, terminalId) {
    return posRepository.getTerminalLogs(tenantId, terminalId);
  },

  async lookupTerminalByCode(tenantId, deviceCode) {
    const code = String(deviceCode || "").trim();
    if (!code) return { found: false };
    const terminal = await posRepository.findTerminalByDeviceCode(tenantId, code);
    if (!terminal) return { found: false };
    return {
      found: true,
      terminal_id: terminal.id,
      terminal_name: terminal.terminal_name,
      device_code: terminal.device_code,
      outlet_id: terminal.outlet_id,
      outlet_name: terminal.outlet_name,
      status: terminal.status,
    };
  },

  async connectTerminal(tenantId, userId, body) {
    const code = String(body.device_code || "").trim();
    if (!code) throw new Error("Terminal code is required");
    const terminal = await posRepository.findTerminalByDeviceCode(tenantId, code);
    if (!terminal) throw new Error("No terminal found with this terminal code.");
    if (terminal.status !== "active") throw new Error("This terminal is not active.");

    let { register, drawerMeta } = await ensureActiveRegister(tenantId, userId, terminal);

    const products = await posInventoryService.listTerminalProducts(tenantId, terminal.outlet_id);
    return {
      terminal,
      register,
      products,
      drawer: drawerInfo(terminal, drawerMeta),
    };
  },

  async getTerminalSession(tenantId, userId, terminalId) {
    const terminal = await posRepository.getTerminal(tenantId, terminalId);
    if (!terminal) return null;
    const { register, drawerMeta } = await ensureActiveRegister(tenantId, userId, terminal);
    const products = await posInventoryService.listTerminalProducts(tenantId, terminal.outlet_id);
    return {
      terminal,
      register,
      products,
      drawer: drawerInfo(terminal, drawerMeta),
    };
  },

  async getTerminalProducts(tenantId, terminalId) {
    const terminal = await posRepository.getTerminal(tenantId, terminalId);
    if (!terminal) return null;
    const products = await posInventoryService.listTerminalProducts(tenantId, terminal.outlet_id);
    return { terminal_id: terminal.id, outlet_id: terminal.outlet_id, outlet_name: terminal.outlet_name, products };
  },

  async closeShift(tenantId, userId, terminalId) {
    const terminal = await posRepository.getTerminal(tenantId, terminalId);
    if (!terminal) throw new Error("Terminal not found");
    const register = await posRepository.getOpenRegister(tenantId, terminalId);
    if (!register) throw new Error("No open shift on this terminal.");
    const closingBalance =
      Number(register.opening_balance) + Number(register.cash_collected);
    const ok = await posRepository.closeRegister(
      tenantId,
      userId,
      register.id,
      closingBalance
    );
    if (!ok) throw new Error("Could not close shift.");
    return {
      register_id: register.id,
      closing_balance: closingBalance,
      next_opening_balance: closingBalance,
    };
  },

  async createTerminalSale(tenantId, userId, body) {
    const terminalId = Number(body.terminal_id);
    if (!Number.isInteger(terminalId) || terminalId <= 0) throw new Error("Terminal is required");
    const terminal = await posRepository.getTerminal(tenantId, terminalId);
    if (!terminal) throw new Error("Terminal not found");

    const register = await posRepository.getOpenRegister(tenantId, terminalId);
    if (!register) throw new Error("No open cash register. Reconnect the terminal.");

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) throw new Error("Add at least one product.");

    const paymentMethod = String(body.payment_method || "cash").trim().toLowerCase();
    const allowedPayments = ["cash", "card", "qris"];
    if (!allowedPayments.includes(paymentMethod)) {
      throw new Error("Invalid payment method");
    }

    const normalized = items.map((item) => {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("Invalid quantity");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Invalid price");
      return {
        variant_id: item.variant_id || item.product_id || null,
        product_id: item.product_id || item.variant_id || null,
        product_name: requireText(item.product_name, "Product name"),
        sku: requireText(item.sku, "SKU"),
        quantity: qty,
        unit_price: unitPrice,
        total_price: Math.round(qty * unitPrice * 100) / 100,
      };
    });

    const totalAmount = normalized.reduce((s, i) => s + i.total_price, 0);
    const discountAmount = Number(body.discount_amount) || 0;
    const payableAmount = Math.max(0, Math.round((totalAmount - discountAmount) * 100) / 100);

    await posInventoryService.deductSaleStock(tenantId, userId, terminal.outlet_id, normalized);

    const cashAmount = paymentMethod === "cash" ? payableAmount : 0;

    return posRepository.createSale(tenantId, userId, {
      total_amount: totalAmount,
      discount_amount: discountAmount,
      payable_amount: payableAmount,
      payment_status: paymentMethod,
      outlet_id: terminal.outlet_id,
      terminal_id: terminalId,
      crm_customers_id: body.crm_customers_id || null,
      register_id: paymentMethod === "cash" ? register.id : null,
      register_cash_amount: cashAmount,
      items: normalized,
    });
  },
};

export { POS_MODULE };
