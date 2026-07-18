import {
  normalizeDarazOrder,
  normalizeDarazProduct,
  normalizeDarazCustomer,
  normalizeDarazWarehouse,
} from "../../normalizers/daraz.js";
import {
  darazCredentialsForStore,
  apiBaseFromStore,
  fetchAllDaraz,
  orderFetchParams,
  formatDarazDetail,
} from "./darazClient.js";
import {
  addSyncLog,
  upsertSyncedRecord,
  updateInitialSyncStatus,
  touchLastSynced,
  getStoreById,
  getEntityCounts,
} from "../../repositories/ecommerceRepository.js";
import {
  maybeUpdateLinkedProduct,
} from "./ecomImport.js";
import {
  fetchAllDarazWarehouses,
  syncAllDarazWarehouses,
} from "./darazLocationSync.js";

const running = new Set();

async function persistEntity(storeId, tenantId, entityType, raw, normalized, source, platform = "daraz") {
  const externalId =
    entityType === "location"
      ? String(normalized?.externalId || raw.code || raw.warehouse_code || raw.warehouseCode || "")
      : entityType === "customer"
        ? String(normalized?.externalId || raw.buyer_id || raw.customer_id || raw.id || "")
        : String(raw.order_id || raw.item_id || raw.product_id || raw.id);
  if (!externalId) return;
  await upsertSyncedRecord(storeId, tenantId, entityType, externalId, raw, normalized, source, platform);
  if (entityType === "product") {
    await maybeUpdateLinkedProduct(tenantId, storeId, normalized);
  }
  await touchLastSynced(storeId, tenantId);
}

function formatDarazError(error) {
  const data = error.response?.data;
  if (data) {
    const code = data.code != null ? String(data.code) : "";
    const msg = data.message || data.msg || `Daraz API error${code ? ` ${code}` : ""}`;
    const detailText = formatDarazDetail(data.detail ?? data.details);
    let full = code && !String(msg).includes(code) ? `${code}: ${msg}` : msg;
    if (detailText && !full.includes(detailText)) full = `${full} (${detailText})`;
    return full;
  }
  return error.message || "Unknown error";
}

/** Dedupe buyers from orders by buyer_id, then phone, then email. */
function collectCustomersFromOrders(orders = []) {
  const seen = new Map();

  const keyFor = (buyer) => {
    if (buyer.buyer_id) return `id:${String(buyer.buyer_id).trim().toLowerCase()}`;
    const phone = String(buyer.phone || "").replace(/\D/g, "");
    if (phone.length >= 7) return `phone:${phone}`;
    const email = String(buyer.buyer_email || buyer.email || "").trim().toLowerCase();
    if (email) return `email:${email}`;
    if (buyer.order_id) return `order:${buyer.order_id}`;
    return null;
  };

  for (const order of orders) {
    const address = order.address_billing || order.address_shipping || {};
    const buyer = {
      buyer_id: order.buyer_id || order.customer_id || null,
      buyer_name: [order.customer_first_name, order.customer_last_name].filter(Boolean).join(" ")
        || [address.first_name, address.last_name].filter(Boolean).join(" ")
        || "Unknown",
      buyer_email: address.customer_email || order.buyer_email || "",
      phone: address.phone || address.phone2 || order.buyer_phone || "",
      order_id: order.order_id,
      order_count: 1,
    };
    const key = keyFor(buyer);
    if (!key) continue;
    if (seen.has(key)) {
      const prev = seen.get(key);
      prev.order_count = (prev.order_count || 1) + 1;
      if (!prev.buyer_email && buyer.buyer_email) prev.buyer_email = buyer.buyer_email;
      if (!prev.phone && buyer.phone) prev.phone = buyer.phone;
      if ((!prev.buyer_name || prev.buyer_name === "Unknown") && buyer.buyer_name) {
        prev.buyer_name = buyer.buyer_name;
      }
    } else {
      seen.set(key, buyer);
    }
  }
  return [...seen.values()];
}

export async function runDarazInitialSync(storeId, tenantId) {
  if (running.has(storeId)) return;
  running.add(storeId);

  const store = await getStoreById(storeId, tenantId);
  if (!store) {
    running.delete(storeId);
    return;
  }

  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const orderParams = orderFetchParams(apiBase);
  const summary = { warehouses: 0, orders: 0, products: 0, customers: 0, deferredWarehouses: 0 };

  await updateInitialSyncStatus(storeId, tenantId, "running");
  await addSyncLog(storeId, store.tenant_id, {
    syncType: "initial_sync",
    status: "started",
    message: `Pulling warehouses, orders and products from Daraz (${apiBase}, created_after=${orderParams.created_after})`,
  });

  try {
    // Warehouses first so imported product stock lands in the mapped ERP warehouse.
    try {
      const warehouses = await fetchAllDarazWarehouses(store);
      for (const wh of warehouses) {
        const normalized = normalizeDarazWarehouse(wh);
        if (!normalized.externalId) continue;
        await persistEntity(
          storeId,
          store.tenant_id,
          "location",
          wh,
          normalized,
          "initial_sync",
        );
      }
      const locResult = await syncAllDarazWarehouses(storeId, store.tenant_id, warehouses);
      summary.warehouses = locResult.synced || warehouses.length;
      summary.deferredWarehouses = locResult.deferred || 0;
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:location",
        status: "success",
        message: `Synced ${locResult.synced} warehouse(s)${locResult.deferred ? ` (${locResult.deferred} need mapping)` : ""}`,
      });
    } catch (error) {
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:location",
        status: "failed",
        message: formatDarazError(error),
      });
      // Continue — orders/products still useful without warehouse mapping.
    }

    let orders = [];
    try {
      orders = await fetchAllDaraz(
        apiBase,
        "/orders/get",
        creds,
        orderParams,
        "orders",
        "order_list",
      );
      for (const order of orders) {
        await persistEntity(
          storeId,
          store.tenant_id,
          "order",
          order,
          normalizeDarazOrder(order),
          "initial_sync",
        );
      }
      summary.orders = orders.length;
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:order",
        status: "success",
        message: `Synced ${orders.length} order(s)`,
      });
    } catch (error) {
      const msg = formatDarazError(error);
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:order",
        status: "failed",
        message: msg,
      });
      throw error;
    }

    try {
      const products = await fetchAllDaraz(
        apiBase,
        "/products/get",
        creds,
        { filter: "all" },
        "products",
        "product_list",
      );
      let productOk = 0;
      let productErr = 0;
      for (const product of products) {
        try {
          await persistEntity(
            storeId,
            store.tenant_id,
            "product",
            product,
            normalizeDarazProduct(product),
            "initial_sync",
          );
          productOk += 1;
        } catch (err) {
          productErr += 1;
          await addSyncLog(storeId, store.tenant_id, {
            syncType: "initial_sync:product",
            status: "failed",
            externalId: String(product.item_id || product.product_id || ""),
            message: err.message || "Failed to stage product",
          });
        }
      }
      summary.products = productOk;
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:product",
        status: productErr ? "partial" : "success",
        message: `Synced ${productOk} product(s)${productErr ? ` (${productErr} failed)` : ""}`,
      });
    } catch (error) {
      const msg = formatDarazError(error);
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:product",
        status: "failed",
        message: msg,
      });
      throw error;
    }

    const customers = collectCustomersFromOrders(orders);
    for (const buyer of customers) {
      const normalized = normalizeDarazCustomer(buyer);
      if (!normalized.externalId) continue;
      await persistEntity(
        storeId,
        store.tenant_id,
        "customer",
        buyer,
        normalized,
        "initial_sync",
      );
    }
    summary.customers = customers.length;
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync:customer",
      status: "success",
      message: `Synced ${customers.length} customer(s) from orders`,
    });

    const counts = await getEntityCounts(storeId, store.tenant_id);
    await updateInitialSyncStatus(storeId, tenantId, "completed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "completed",
      message:
        `Fetched ${summary.warehouses} warehouse(s)`
        + `${summary.deferredWarehouses ? ` (${summary.deferredWarehouses} need mapping)` : ""}`
        + `, ${summary.orders} order(s), ${summary.products} product(s), ${summary.customers} customer(s). `
        + `Staged totals — products: ${counts.product || 0}, orders: ${counts.order || 0}, `
        + `customers: ${counts.customer || 0}, warehouses: ${counts.location || 0}. Review and import into your ERP when ready.`,
    });
  } catch (error) {
    await updateInitialSyncStatus(storeId, tenantId, "failed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "failed",
      message: formatDarazError(error),
    });
  } finally {
    running.delete(storeId);
  }
}

export async function verifyDarazConnection(store) {
  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const { darazApiGet, unwrapDarazResponse } = await import("./darazClient.js");
  const data = await darazApiGet(apiBase, "/seller/get", creds);
  return unwrapDarazResponse(data);
}
