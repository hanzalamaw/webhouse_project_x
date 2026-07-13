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
} from "./darazClient.js";
import {
  addSyncLog,
  upsertSyncedRecord,
  updateInitialSyncStatus,
  touchLastSynced,
  getStoreById,
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
        ? String(raw.buyer_id || raw.customer_id || raw.id)
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
  if (data?.message) {
    const code = data.code ? String(data.code) : "";
    return code && !String(data.message).includes(code) ? `${code}: ${data.message}` : data.message;
  }
  return error.message || "Unknown error";
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
      for (const product of products) {
        await persistEntity(
          storeId,
          store.tenant_id,
          "product",
          product,
          normalizeDarazProduct(product),
          "initial_sync",
        );
      }
      await addSyncLog(storeId, store.tenant_id, {
        syncType: "initial_sync:product",
        status: "success",
        message: `Synced ${products.length} product(s)`,
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

    const seen = new Map();
    for (const order of orders) {
      const buyerId = order.buyer_id || order.customer_first_name || order.order_id;
      if (!seen.has(buyerId)) {
        seen.set(buyerId, {
          buyer_id: order.buyer_id || buyerId,
          buyer_name: [order.customer_first_name, order.customer_last_name]
            .filter(Boolean)
            .join(" "),
          buyer_email: order.address_billing?.customer_email || order.buyer_email,
          phone: order.address_billing?.phone || order.buyer_phone,
          order_count: 1,
        });
      }
    }
    const customers = [...seen.values()];
    for (const buyer of customers) {
      await persistEntity(
        storeId,
        store.tenant_id,
        "customer",
        buyer,
        normalizeDarazCustomer(buyer),
        "initial_sync",
      );
    }
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync:customer",
      status: "success",
      message: `Synced ${customers.length} customer(s) from orders`,
    });

    await updateInitialSyncStatus(storeId, tenantId, "completed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "completed",
      message: "Store data fetched — review and import into your ERP when ready",
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
