import { normalizeDarazWarehouse } from "../../normalizers/daraz.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { posRepository } from "../../repositories/posRepository.js";
import {
  getLocationLink,
  listLocationLinks,
  upsertLocationLink,
  getSyncedRecords,
  addSyncLog,
  getStoreById,
  upsertSyncedRecord,
} from "../../repositories/ecommerceRepository.js";
import {
  darazApiGet,
  unwrapDarazResponse,
  darazCredentialsForStore,
  apiBaseFromStore,
} from "./darazClient.js";
import { assertOneToOneLocationSelections } from "./shopifyPolicy.js";

/** Active Daraz warehouses only (INACTIVE / return addresses are not inventory targets). */
export function isMappableDarazWarehouse(rawOrNormalized) {
  if (!rawOrNormalized) return false;
  const normalized =
    rawOrNormalized.externalId != null
      ? rawOrNormalized
      : normalizeDarazWarehouse(rawOrNormalized);
  return Boolean(normalized.externalId) && normalized.active !== false;
}

function extractWarehouseList(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  for (const key of ["module", "warehouses", "warehouse_list", "data"]) {
    const val = result[key];
    if (Array.isArray(val)) return val;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      // /rc/warehouse/get sometimes returns a single module object
      if (val.code || val.warehouse_code || val.warehouseCode) return [val];
    }
  }
  if (result.code || result.warehouse_code || result.warehouseCode) return [result];
  return [];
}

/**
 * Fetch seller warehouses from Daraz/Lazada.
 * Primary: GetMultiWarehouseBySeller — required addressTypes=["warehouse"].
 * Fallback: GetWarehouseBySellerId (/rc/warehouse/get).
 */
export async function fetchAllDarazWarehouses(store) {
  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const errors = [];

  try {
    const data = await darazApiGet(apiBase, "/warehouse/getMultiWarehouseBySeller", creds, {
      addressTypes: '["warehouse"]',
    });
    const result = unwrapDarazResponse(data);
    const list = extractWarehouseList(result);
    if (list.length) return list;
  } catch (error) {
    errors.push(error.message || "getMultiWarehouseBySeller failed");
  }

  try {
    const data = await darazApiGet(apiBase, "/rc/warehouse/get", creds, {});
    const result = unwrapDarazResponse(data);
    const list = extractWarehouseList(result);
    if (list.length) return list;
  } catch (error) {
    errors.push(error.message || "rc/warehouse/get failed");
  }

  if (errors.length) {
    const err = new Error(errors.join("; "));
    err.partial = true;
    throw err;
  }
  return [];
}

async function refreshSyncedDarazWarehouses(storeId, tenantId, rawWarehouses) {
  const mappable = rawWarehouses.filter(isMappableDarazWarehouse);
  for (const raw of mappable) {
    const normalized = normalizeDarazWarehouse(raw);
    await upsertSyncedRecord(
      storeId,
      tenantId,
      "location",
      String(normalized.externalId),
      raw,
      normalized,
      "warehouse_refresh",
      "daraz",
    );
  }
  return mappable;
}

async function findWarehouseByName(tenantId, name) {
  const warehouses = await inventoryRepository.listAllWarehousesBrief(tenantId);
  const target = name.trim().toLowerCase();
  return warehouses.find((w) => w.warehouse_name?.trim().toLowerCase() === target) || null;
}

async function findOutletByName(tenantId, name) {
  const outlets = await posRepository.listOutlets(tenantId);
  const target = name.trim().toLowerCase();
  return outlets.find((o) => o.outlet_name?.trim().toLowerCase() === target) || null;
}

async function warehouseCapacity(tenantId) {
  const [limit, count] = await Promise.all([
    inventoryRepository.getTenantWarehouseLimit(tenantId),
    inventoryRepository.countWarehouses(tenantId),
  ]);
  return { limit, count, canCreate: limit <= 0 || count < limit };
}

async function outletCapacity(tenantId) {
  const [limit, count] = await Promise.all([
    posRepository.getTenantStoreLimit(tenantId),
    posRepository.countOutlets(tenantId),
  ]);
  return { limit, count, canCreate: limit <= 0 || count < limit };
}

/**
 * Map a Daraz warehouse code to an ERP warehouse (and optional POS outlet).
 * Reuses ecom_location_links.shopify_location_id as the external warehouse code.
 */
export async function importDarazWarehouse(tenantId, storeId, rawWarehouse) {
  const normalized = normalizeDarazWarehouse(rawWarehouse);
  const mappable = isMappableDarazWarehouse(normalized);
  const existing = await getLocationLink(storeId, normalized.externalId);

  let warehouseId = existing?.warehouse_id || null;
  let outletId = existing?.outlet_id || null;
  let deferred = false;

  if (!warehouseId && mappable) {
    const matched = await findWarehouseByName(tenantId, normalized.name);
    if (matched) {
      warehouseId = matched.id;
    } else if ((await warehouseCapacity(tenantId)).canCreate) {
      warehouseId = await inventoryRepository.createWarehouse(tenantId, {
        warehouse_name: normalized.name.slice(0, 100),
        location: normalized.address || null,
        city: normalized.city || null,
        status: normalized.active ? "active" : "inactive",
      });
    } else {
      deferred = true;
    }
  }

  if (!outletId && mappable) {
    const matched = await findOutletByName(tenantId, normalized.name);
    if (matched) {
      outletId = matched.id;
    } else if ((await outletCapacity(tenantId)).canCreate) {
      const outlet = await posRepository.createOutlet(tenantId, {
        outlet_name: normalized.name.slice(0, 100),
        location: normalized.address || null,
        city: normalized.city || null,
        status: normalized.active ? "active" : "inactive",
      });
      outletId = outlet?.id || null;
    } else {
      deferred = true;
    }
  }

  await upsertLocationLink({
    tenantId,
    storeId,
    shopifyLocationId: normalized.externalId,
    locationName: normalized.name,
    warehouseId,
    outletId,
    active: normalized.active,
  });

  return { normalized, warehouseId, outletId, deferred };
}

export async function syncAllDarazWarehouses(storeId, tenantId, warehouses) {
  let synced = 0;
  let deferred = 0;
  for (const wh of warehouses.filter(isMappableDarazWarehouse)) {
    try {
      const res = await importDarazWarehouse(tenantId, storeId, wh);
      synced += 1;
      if (res.deferred) deferred += 1;
    } catch (error) {
      await addSyncLog(storeId, tenantId, {
        syncType: "location_sync",
        externalId: String(wh.code || wh.warehouse_code || wh.warehouseCode || ""),
        status: "failed",
        message: error.message || "Failed to import Daraz warehouse",
      });
    }
  }
  if (synced > 0) {
    await addSyncLog(storeId, tenantId, {
      syncType: "location_sync",
      status: deferred > 0 ? "partial" : "success",
      message:
        deferred > 0
          ? `Synced ${synced} Daraz warehouse(s); ${deferred} need mapping (plan limit reached) — choose them in Integrations → Locations`
          : `Synced ${synced} Daraz warehouse(s) to ERP warehouses`,
    });
  }
  return { synced, deferred };
}

async function loadRawDarazWarehouses(tenantId, storeId) {
  const store = await getStoreById(storeId, tenantId);
  if (store?.access_token) {
    try {
      const raw = await fetchAllDarazWarehouses(store);
      await refreshSyncedDarazWarehouses(storeId, tenantId, raw);
      return raw;
    } catch {
      // fall through to staged records
    }
  }
  const records = await getSyncedRecords(storeId, tenantId, "location", 500);
  return records.map((rec) => rec.raw || {});
}

/** Build the mapping panel data for Daraz warehouses. */
export async function getDarazLocationMappingData(tenantId, storeId) {
  const [links, warehouses, outlets, whCap, outCap, rawWarehouses] = await Promise.all([
    listLocationLinks(storeId),
    inventoryRepository.listAllWarehousesBrief(tenantId),
    posRepository.listOutlets(tenantId),
    warehouseCapacity(tenantId),
    outletCapacity(tenantId),
    loadRawDarazWarehouses(tenantId, storeId),
  ]);

  const linkByLocation = new Map(links.map((l) => [String(l.shopify_location_id), l]));
  const warehouseMappedTo = new Map(
    links.filter((l) => l.warehouse_id).map((l) => [Number(l.warehouse_id), String(l.shopify_location_id)]),
  );
  const seen = new Set();

  const locations = rawWarehouses
    .filter(isMappableDarazWarehouse)
    .map((raw) => normalizeDarazWarehouse(raw))
    .filter((normalized) => {
      const id = String(normalized.externalId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((normalized) => {
      const link = linkByLocation.get(String(normalized.externalId));
      return {
        shopifyLocationId: String(normalized.externalId),
        name: normalized.name,
        city: normalized.city || "",
        address: normalized.address || "",
        active: normalized.active,
        warehouseId: link?.warehouse_id || null,
        outletId: link?.outlet_id || null,
        mapped: Boolean(link?.warehouse_id),
      };
    });

  return {
    locations,
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.warehouse_name,
      mappedLocationId: warehouseMappedTo.get(Number(w.id)) || null,
    })),
    outlets: outlets.map((o) => ({ id: o.id, name: o.outlet_name })),
    warehouseCapacity: whCap,
    outletCapacity: outCap,
  };
}

/**
 * Apply user-chosen Daraz warehouse mappings.
 * selections: [{ shopifyLocationId, warehouseAction, warehouseId, outletAction, outletId }]
 */
export async function applyDarazLocationSelections(tenantId, storeId, selections = []) {
  const rawWarehouses = await loadRawDarazWarehouses(tenantId, storeId);
  const byId = new Map(
    rawWarehouses
      .filter(isMappableDarazWarehouse)
      .map((raw) => {
        const n = normalizeDarazWarehouse(raw);
        return [String(n.externalId), n];
      }),
  );

  const results = [];
  const existingLinks = await listLocationLinks(storeId);
  try {
    assertOneToOneLocationSelections(selections, existingLinks);
  } catch (e) {
    return {
      results: selections.map((sel) => ({
        shopifyLocationId: String(sel.shopifyLocationId),
        ok: false,
        error: e.message,
      })),
      ...(await getDarazLocationMappingData(tenantId, storeId)),
    };
  }

  for (const sel of selections) {
    const locId = String(sel.shopifyLocationId);
    const normalized = byId.get(locId);
    if (!normalized) {
      results.push({ shopifyLocationId: locId, ok: false, error: "Warehouse not found" });
      continue;
    }

    let warehouseId = null;
    let outletId = null;

    try {
      if (sel.warehouseAction === "existing") {
        warehouseId = Number(sel.warehouseId) || null;
      } else if (sel.warehouseAction === "create") {
        if (!(await warehouseCapacity(tenantId)).canCreate) {
          throw new Error("Warehouse limit reached — map to an existing warehouse instead.");
        }
        warehouseId = await inventoryRepository.createWarehouse(tenantId, {
          warehouse_name: normalized.name.slice(0, 100),
          location: normalized.address || null,
          city: normalized.city || null,
          status: normalized.active ? "active" : "inactive",
        });
      }

      if (sel.outletAction === "existing") {
        outletId = Number(sel.outletId) || null;
      } else if (sel.outletAction === "create") {
        if (!(await outletCapacity(tenantId)).canCreate) {
          throw new Error("POS outlet limit reached — map to an existing outlet instead.");
        }
        const outlet = await posRepository.createOutlet(tenantId, {
          outlet_name: normalized.name.slice(0, 100),
          location: normalized.address || null,
          city: normalized.city || null,
          status: normalized.active ? "active" : "inactive",
        });
        outletId = outlet?.id || null;
      }

      await upsertLocationLink({
        tenantId,
        storeId,
        shopifyLocationId: locId,
        locationName: normalized.name,
        warehouseId,
        outletId,
        active: normalized.active,
      });
      results.push({ shopifyLocationId: locId, ok: true, warehouseId, outletId });
    } catch (e) {
      results.push({ shopifyLocationId: locId, ok: false, error: e.message });
    }
  }

  const mapping = await getDarazLocationMappingData(tenantId, storeId);
  return { results, ...mapping };
}
