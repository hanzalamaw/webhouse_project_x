import {
  normalizeDarazOrder,
  normalizeDarazProduct,
  normalizeDarazCustomer,
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
  importNormalizedProduct,
  importAllSyncedProductsForStore,
} from "./ecomImport.js";

const running = new Set();

async function persistEntity(storeId, tenantId, entityType, raw, normalized, source, platform = "daraz") {
  const externalId =
    entityType === "customer"
      ? String(raw.buyer_id || raw.customer_id || raw.id)
      : String(raw.order_id || raw.item_id || raw.product_id || raw.id);
  await upsertSyncedRecord(storeId, tenantId, entityType, externalId, raw, normalized, source, platform);
  if (entityType === "product") {
    await importNormalizedProduct(tenantId, normalized, { storeId });
  }
  await touchLastSynced(storeId);
}

function formatDarazError(error) {
  const data = error.response?.data;
  if (data?.message) {
    const code = data.code ? String(data.code) : "";
    return code && !String(data.message).includes(code) ? `${code}: ${data.message}` : data.message;
  }
  return error.message || "Unknown error";
}

export async function runDarazInitialSync(storeId) {
  if (running.has(storeId)) return;
  running.add(storeId);

  const store = await getStoreById(storeId);
  if (!store) {
    running.delete(storeId);
    return;
  }

  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const orderParams = orderFetchParams(apiBase);

  await updateInitialSyncStatus(storeId, "running");
  await addSyncLog(storeId, store.tenant_id, {
    syncType: "initial_sync",
    status: "started",
    message: `Pulling orders and products from Daraz (${apiBase}, created_after=${orderParams.created_after})`,
  });

  try {
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

    await importAllSyncedProductsForStore(storeId, store.tenant_id);

    await updateInitialSyncStatus(storeId, "completed");
    await addSyncLog(storeId, store.tenant_id, {
      syncType: "initial_sync",
      status: "completed",
      message: "Daraz initial sync completed",
    });
  } catch (error) {
    await updateInitialSyncStatus(storeId, "failed");
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
