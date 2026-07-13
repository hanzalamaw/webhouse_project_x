import axios from "axios";
import { normalizeShopifyLocation } from "../../normalizers/shopify.js";
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
import { shopifyClient } from "./shopifyClient.js";
import { assertOneToOneLocationSelections } from "./shopifyPolicy.js";

/** Shopify keeps legacy/inactive locations in the API; only active non-legacy locations are usable. */
export function isMappableShopifyLocation(rawOrNormalized) {
  if (!rawOrNormalized) return false;
  const normalized =
    rawOrNormalized.externalId != null
      ? rawOrNormalized
      : normalizeShopifyLocation(rawOrNormalized);
  return normalized.active !== false && !normalized.legacy;
}

async function fetchAllShopifyLocations(store) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const token = client.defaults.headers["X-Shopify-Access-Token"];
  const items = [];
  let nextUrl = null;
  let isFirst = true;

  while (isFirst || nextUrl) {
    const response = nextUrl
      ? await axios.get(nextUrl, {
          headers: { "X-Shopify-Access-Token": token },
          timeout: 60000,
        })
      : await client.get("/locations.json", { params: { limit: 250 } });

    const batch = response.data.locations || [];
    items.push(...batch);

    const link = response.headers.link || response.headers.Link || "";
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
    isFirst = false;
  }
  return items;
}

async function refreshSyncedShopifyLocations(storeId, tenantId, rawLocations) {
  const mappable = rawLocations.filter(isMappableShopifyLocation);
  for (const raw of mappable) {
    const normalized = normalizeShopifyLocation(raw);
    await upsertSyncedRecord(
      storeId,
      tenantId,
      "location",
      String(raw.id),
      raw,
      normalized,
      "location_refresh",
      "shopify",
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
 * Map a Shopify location to a warehouse and POS outlet.
 * Limit-aware: if the tenant is at its plan limit and there is no name match,
 * the location is recorded but left unmapped so the user can choose in the
 * integration's Locations panel.
 */
export async function importShopifyLocation(tenantId, storeId, rawLocation) {
  const normalized = normalizeShopifyLocation(rawLocation);
  const mappable = isMappableShopifyLocation(normalized);
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

export async function syncAllShopifyLocations(storeId, tenantId, locations) {
  let synced = 0;
  let deferred = 0;
  for (const loc of locations.filter(isMappableShopifyLocation)) {
    try {
      const res = await importShopifyLocation(tenantId, storeId, loc);
      synced += 1;
      if (res.deferred) deferred += 1;
    } catch (error) {
      await addSyncLog(storeId, tenantId, {
        syncType: "location_sync",
        externalId: String(loc.id),
        status: "failed",
        message: error.message || "Failed to import location",
      });
    }
  }
  if (synced > 0) {
    await addSyncLog(storeId, tenantId, {
      syncType: "location_sync",
      status: deferred > 0 ? "partial" : "success",
      message:
        deferred > 0
          ? `Synced ${synced} location(s); ${deferred} need mapping (plan limit reached) — choose them in Integrations → Locations`
          : `Synced ${synced} Shopify location(s) to warehouses and POS outlets`,
    });
  }
  return { synced, deferred };
}

/** Build the mapping panel data: live Shopify locations, their current links, and plan capacity. */
export async function getLocationMappingData(tenantId, storeId) {
  const store = await getStoreById(storeId, tenantId);
  const [links, warehouses, outlets, whCap, outCap] = await Promise.all([
    listLocationLinks(storeId),
    inventoryRepository.listAllWarehousesBrief(tenantId),
    posRepository.listOutlets(tenantId),
    warehouseCapacity(tenantId),
    outletCapacity(tenantId),
  ]);

  let rawLocations = [];
  if (store?.store_url && store?.access_token) {
    try {
      rawLocations = await fetchAllShopifyLocations(store);
      await refreshSyncedShopifyLocations(storeId, tenantId, rawLocations);
    } catch {
      const records = await getSyncedRecords(storeId, tenantId, "location", 500);
      rawLocations = records.map((rec) => rec.raw || {});
    }
  } else {
    const records = await getSyncedRecords(storeId, tenantId, "location", 500);
    rawLocations = records.map((rec) => rec.raw || {});
  }

  const linkByLocation = new Map(links.map((l) => [String(l.shopify_location_id), l]));
  const warehouseMappedTo = new Map(
    links.filter((l) => l.warehouse_id).map((l) => [Number(l.warehouse_id), String(l.shopify_location_id)]),
  );
  const seen = new Set();

  const locations = rawLocations
    .filter(isMappableShopifyLocation)
    .map((raw) => normalizeShopifyLocation(raw))
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
 * Apply user-chosen location mappings.
 * selections: [{ shopifyLocationId, warehouseAction, warehouseId, outletAction, outletId }]
 *   action = 'create' | 'existing' | 'skip'
 */
export async function applyLocationSelections(tenantId, storeId, selections = []) {
  const store = await getStoreById(storeId, tenantId);
  let rawLocations = [];
  if (store?.store_url && store?.access_token) {
    try {
      rawLocations = await fetchAllShopifyLocations(store);
      await refreshSyncedShopifyLocations(storeId, tenantId, rawLocations);
    } catch {
      const records = await getSyncedRecords(storeId, tenantId, "location", 500);
      rawLocations = records.map((rec) => rec.raw || {});
    }
  } else {
    const records = await getSyncedRecords(storeId, tenantId, "location", 500);
    rawLocations = records.map((rec) => rec.raw || {});
  }

  const byId = new Map(
    rawLocations
      .filter(isMappableShopifyLocation)
      .map((raw) => {
        const n = normalizeShopifyLocation(raw);
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
      ...(await getLocationMappingData(tenantId, storeId)),
    };
  }

  for (const sel of selections) {
    const locId = String(sel.shopifyLocationId);
    const normalized = byId.get(locId);
    if (!normalized) {
      results.push({ shopifyLocationId: locId, ok: false, error: "Location not found" });
      continue;
    }

    let warehouseId = null;
    let outletId = null;
    let error = null;

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
      error = e.message;
      results.push({ shopifyLocationId: locId, ok: false, error });
    }
  }

  const mapping = await getLocationMappingData(tenantId, storeId);
  return { results, ...mapping };
}
