import { posRepository } from "../repositories/posRepository.js";
import {
  POS_MODULE,
  OUTLET_STATUSES,
  TERMINAL_STATUSES,
  TERMINAL_DEVICE_CODE,
} from "../utils/posConstants.js";

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

  getOutlet(tenantId, id) {
    return posRepository.getOutlet(tenantId, id);
  },

  async createOutlet(tenantId, body) {
    return posRepository.createOutlet(tenantId, {
      outlet_name: requireText(body.outlet_name, "Outlet name"),
      location: body.location || null,
      city: body.city || null,
      status: normalizeStatus(body.status, OUTLET_STATUSES, "active"),
    });
  },

  async updateOutlet(tenantId, id, body) {
    const existing = await posRepository.getOutlet(tenantId, id);
    if (!existing) return null;
    return posRepository.updateOutlet(tenantId, id, {
      outlet_name: requireText(body.outlet_name ?? existing.outlet_name, "Outlet name"),
      location: body.location ?? existing.location,
      city: body.city ?? existing.city,
      status: normalizeStatus(body.status ?? existing.status, OUTLET_STATUSES, existing.status),
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
    if (!Number.isInteger(outletId) || outletId <= 0) throw new Error("Outlet is required");
    const outlet = await posRepository.getOutlet(tenantId, outletId);
    if (!outlet) throw new Error("Outlet not found");
    return posRepository.createTerminal(tenantId, {
      terminal_name: requireText(body.terminal_name, "Terminal name"),
      device_code: requireText(body.device_code, "Device code"),
      status: normalizeStatus(body.status, TERMINAL_STATUSES, "active"),
      outlet_id: outletId,
    });
  },

  async updateTerminal(tenantId, id, body) {
    const existing = await posRepository.getTerminal(tenantId, id);
    if (!existing) return null;
    const outletId = body.outlet_id != null ? Number(body.outlet_id) : existing.outlet_id;
    if (!Number.isInteger(outletId) || outletId <= 0) throw new Error("Outlet is required");
    const outlet = await posRepository.getOutlet(tenantId, outletId);
    if (!outlet) throw new Error("Outlet not found");
    return posRepository.updateTerminal(tenantId, id, {
      terminal_name: requireText(body.terminal_name ?? existing.terminal_name, "Terminal name"),
      device_code: requireText(body.device_code ?? existing.device_code, "Device code"),
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

  async connectTerminal(tenantId, userId, deviceCode) {
    const code = String(deviceCode || "").trim();
    if (code !== TERMINAL_DEVICE_CODE) {
      throw new Error(`Invalid machine code. Use ${TERMINAL_DEVICE_CODE} for now.`);
    }
    const terminal = await posRepository.getTerminalByDeviceCode(tenantId, code);
    if (!terminal) throw new Error("No terminal registered with this machine code.");
    if (terminal.status !== "active") throw new Error("This terminal is not active.");

    let register = await posRepository.getOpenRegister(tenantId, terminal.id);
    if (!register) {
      const lastClosed = await posRepository.getLastClosedRegister(tenantId, terminal.id);
      const openingBalance = lastClosed?.closing_balance != null
        ? Number(lastClosed.closing_balance)
        : 0;
      register = await posRepository.openRegister(tenantId, userId, terminal, openingBalance);
    }

    const products = await posRepository.listTerminalProducts(tenantId);
    return { terminal, register, products };
  },

  async getTerminalSession(tenantId, terminalId) {
    const terminal = await posRepository.getTerminal(tenantId, terminalId);
    if (!terminal) return null;
    const register = await posRepository.getOpenRegister(tenantId, terminalId);
    const products = await posRepository.listTerminalProducts(tenantId);
    return { terminal, register, products };
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

    const normalized = items.map((item) => {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      if (!Number.isInteger(qty) || qty <= 0) throw new Error("Invalid quantity");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Invalid price");
      return {
        product_id: item.product_id || null,
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

    return posRepository.createSale(tenantId, userId, {
      total_amount: totalAmount,
      discount_amount: discountAmount,
      payable_amount: payableAmount,
      payment_status: "paid",
      outlet_id: terminal.outlet_id,
      terminal_id: terminalId,
      crm_customers_id: body.crm_customers_id || null,
      register_id: register.id,
      items: normalized,
    });
  },
};

export { POS_MODULE };
