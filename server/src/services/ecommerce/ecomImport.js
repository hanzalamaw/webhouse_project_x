import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { getSyncedRecords, getEntityCounts, addSyncLog } from "../../repositories/ecommerceRepository.js";

const MARKETPLACE_CATEGORY = "Marketplace";
const DEFAULT_WAREHOUSE = "Main Warehouse";

const categoryCache = new Map();
const warehouseCache = new Map();

function mapProductStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["inactive", "deleted", "suspended", "rejected", "delisted"].includes(s)) {
    return "inactive";
  }
  return "active";
}

function resolveSku(normalized) {
  const sku = String(normalized.sku || "").trim();
  if (sku) return sku.slice(0, 100);
  const platform = normalized.platform || "ecom";
  return `${platform}:${normalized.externalId}`.slice(0, 100);
}

async function ensureMarketplaceCategory(tenantId) {
  if (categoryCache.has(tenantId)) return categoryCache.get(tenantId);

  let cat = await inventoryRepository.findCategoryByName(tenantId, MARKETPLACE_CATEGORY);
  if (!cat) {
    const id = await inventoryRepository.createCategory(tenantId, {
      category_name: MARKETPLACE_CATEGORY,
      status: "active",
    });
    categoryCache.set(tenantId, id);
    return id;
  }

  categoryCache.set(tenantId, cat.id);
  return cat.id;
}

async function ensureDefaultWarehouse(tenantId) {
  if (warehouseCache.has(tenantId)) return warehouseCache.get(tenantId);

  const warehouses = await inventoryRepository.listWarehousesBrief(tenantId);
  const active = warehouses.find((w) => w.status === "active") || warehouses[0];
  if (active) {
    warehouseCache.set(tenantId, active.id);
    return active.id;
  }

  const id = await inventoryRepository.createWarehouse(tenantId, {
    warehouse_name: DEFAULT_WAREHOUSE,
    location: null,
    city: null,
    status: "active",
  });
  warehouseCache.set(tenantId, id);
  return id;
}

export async function importNormalizedProduct(tenantId, normalized, { storeId } = {}) {
  if (!normalized?.externalId) return null;

  try {
    const categoryId = await ensureMarketplaceCategory(tenantId);
    const sku = resolveSku(normalized);
    const productName =
      String(normalized.name || "").trim() ||
      `${String(normalized.platform || "Marketplace")} product ${normalized.externalId}`;
    const status = mapProductStatus(normalized.status);
    const sellingPrice = Math.max(0, Number(normalized.price) || 0);
    const stock =
      normalized.stock != null && !Number.isNaN(Number(normalized.stock))
        ? Math.max(0, Math.floor(Number(normalized.stock)))
        : null;

    const existing = await inventoryRepository.findProductBySku(tenantId, sku);
    let productId;

    if (existing) {
      const current = await inventoryRepository.getProductById(tenantId, existing.id);
      await inventoryRepository.updateProduct(tenantId, existing.id, {
        product_name: productName,
        sku,
        unit: current?.unit || "piece",
        cost_price: current?.cost_price ?? 0,
        selling_price: sellingPrice,
        delivery_charges: current?.delivery_charges ?? 0,
        discount: current?.discount ?? 0,
        tax: current?.tax ?? 0,
        status,
        category_id: current?.category_id ?? categoryId,
      });
      productId = existing.id;
    } else {
      productId = await inventoryRepository.createProduct(tenantId, {
        product_name: productName,
        sku,
        unit: "piece",
        cost_price: 0,
        selling_price: sellingPrice,
        delivery_charges: 0,
        discount: 0,
        tax: 0,
        status,
        category_id: categoryId,
      });
    }

    if (stock !== null) {
      const warehouseId = await ensureDefaultWarehouse(tenantId);
      await inventoryRepository.setStockLevelAbsolute(tenantId, productId, warehouseId, {
        available_qty: stock,
        reserved_qty: 0,
        damaged_qty: 0,
      });
    }

    return productId;
  } catch (error) {
    if (storeId) {
      await addSyncLog(storeId, tenantId, {
        syncType: "inventory_import:product",
        status: "failed",
        externalId: String(normalized.externalId),
        message: error.message || "Failed to import product to inventory",
      });
    }
    console.error("[ecomImport] product", normalized.externalId, error.message);
    return null;
  }
}

export async function importAllSyncedProductsForStore(storeId, tenantId) {
  const records = await getSyncedRecords(storeId, "product", 5000);
  let imported = 0;
  let failed = 0;

  for (const record of records) {
    const id = await importNormalizedProduct(tenantId, record.normalized, { storeId });
    if (id) imported += 1;
    else failed += 1;
  }

  if (records.length) {
    await addSyncLog(storeId, tenantId, {
      syncType: "inventory_import:product",
      status: failed ? "partial" : "success",
      message: `Imported ${imported} of ${records.length} product(s) into inventory`,
    });
  }

  return { imported, failed, total: records.length };
}

export async function needsInventoryProductImport(storeId, tenantId) {
  const counts = await getEntityCounts(storeId);
  const syncedProducts = counts.product || 0;
  if (!syncedProducts) return false;

  const category = await inventoryRepository.findCategoryByName(tenantId, MARKETPLACE_CATEGORY);
  if (!category) return true;

  const inventoryProducts = await inventoryRepository.getCategoryProducts(tenantId, category.id);
  return inventoryProducts.length < syncedProducts;
}

export async function ensureInventoryProductsImported(storeId, tenantId) {
  if (!(await needsInventoryProductImport(storeId, tenantId))) {
    return { skipped: true, imported: 0, total: 0 };
  }
  const result = await importAllSyncedProductsForStore(storeId, tenantId);
  return { skipped: false, ...result };
}
