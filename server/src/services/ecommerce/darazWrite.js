import {
  darazApiGet,
  darazApiPost,
  unwrapDarazResponse,
  darazCredentialsForStore,
  apiBaseFromStore,
} from "./darazClient.js";
import { addSyncLog } from "../../repositories/ecommerceRepository.js";

export function formatDarazError(error) {
  const data = error?.response?.data;
  if (data) {
    const code = data.code != null ? String(data.code) : "";
    const msg = data.message || data.msg || (code ? `Daraz API error ${code}` : "Daraz API error");
    if (code && code !== "0" && !String(msg).includes(code)) return `${code}: ${msg}`;
    return msg;
  }
  return error?.message || "Daraz request failed";
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlTag(name, value) {
  if (value == null || value === "") return "";
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function normalizeStr(value) {
  return String(value ?? "").trim();
}

function erpFieldChanged(before, after, key) {
  if (!before) return true;
  return normalizeStr(before[key]) !== normalizeStr(after[key]);
}

function totalAvailableQty(stockLevels = []) {
  return (stockLevels || []).reduce(
    (sum, level) => sum + Math.max(0, Math.floor(Number(level.available_qty) || 0)),
    0,
  );
}

function extractDarazSkus(raw) {
  if (!raw) return [];
  const skus = raw.skus || raw.Skus?.Sku || raw.sku || [];
  const list = Array.isArray(skus) ? skus : skus ? [skus] : [];
  return list.map((sku) => ({
    skuId: String(sku.SkuId ?? sku.sku_id ?? sku.skuId ?? "").trim() || null,
    sellerSku: String(sku.SellerSku ?? sku.seller_sku ?? sku.ShopSku ?? sku.shop_sku ?? "").trim(),
    price: parseFloat(sku.price ?? sku.Price ?? 0) || 0,
    quantity: Math.max(0, Math.floor(Number(sku.quantity ?? sku.Quantity ?? 0) || 0)),
    status: sku.Status || sku.status || null,
  }));
}

export function extractDarazPrimaryCategory(raw) {
  if (!raw) return null;
  const id =
    raw.primary_category
    || raw.PrimaryCategory
    || raw.primary_category_id
    || raw.attributes?.primary_category
    || null;
  return id != null && String(id).trim() ? String(id).trim() : null;
}

/**
 * Match ERP variants to Daraz SKUs by SellerSku, then single-SKU fallback.
 */
export function matchDarazSkusToErpVariants(erpVariants = [], darazSkus = []) {
  const bySku = new Map();
  for (const sku of darazSkus) {
    const key = String(sku.sellerSku || "").trim().toLowerCase();
    if (key) bySku.set(key, sku);
  }

  const matched = [];
  const used = new Set();
  for (const erpV of erpVariants) {
    const key = String(erpV.sku || "").trim().toLowerCase();
    let darazSku = key ? bySku.get(key) : null;
    if (!darazSku && erpVariants.length === 1 && darazSkus.length === 1 && !used.has(0)) {
      darazSku = darazSkus[0];
    }
    if (darazSku) {
      const idx = darazSkus.indexOf(darazSku);
      if (idx >= 0) used.add(idx);
      matched.push({ erpVariant: erpV, darazSku });
    }
  }
  return matched;
}

function buildCreateProductXml({
  primaryCategory,
  product,
  erpVariants,
  stockByVariantId = {},
  warehouseQtyByVariantId = {},
  packageDims = {},
  brand = "",
  shortDescription = "",
}) {
  const variants = Array.isArray(erpVariants) && erpVariants.length
    ? erpVariants
    : [{
        sku: product.sku_prefix || `ERP-${product.id || Date.now()}`,
        selling_price: product.default_selling_price ?? 0,
        id: null,
      }];

  const length = packageDims.length ?? "10";
  const width = packageDims.width ?? "10";
  const height = packageDims.height ?? "10";
  const weight = packageDims.weight ?? "0.5";

  const skuXml = variants.map((v) => {
    const qty = stockByVariantId[v.id] != null
      ? Math.max(0, Math.floor(Number(stockByVariantId[v.id]) || 0))
      : 0;
    const price = Number(v.selling_price) || 0;
    const whRows = warehouseQtyByVariantId[v.id] || [];
    const warehouseParts = whRows
      .filter((w) => w.warehouseCode)
      .map((w) => [
        "<MultiWarehouseInventory>",
        xmlTag("WarehouseCode", w.warehouseCode),
        xmlTag("Quantity", Math.max(0, Math.floor(Number(w.quantity) || 0))),
        "</MultiWarehouseInventory>",
      ].join(""))
      .join("");

    return [
      "<Sku>",
      xmlTag("SellerSku", v.sku),
      warehouseParts
        ? `<MultiWarehouseInventories>${warehouseParts}</MultiWarehouseInventories>`
        : xmlTag("quantity", qty),
      xmlTag("price", price.toFixed(2)),
      xmlTag("package_length", length),
      xmlTag("package_width", width),
      xmlTag("package_height", height),
      xmlTag("package_weight", weight),
      "</Sku>",
    ].join("");
  }).join("");

  const description = product.description || product.product_name || "";
  const shortDesc = shortDescription || description.slice(0, 250);
  const attrParts = [
    xmlTag("name", product.product_name),
    xmlTag("description", description),
    xmlTag("short_description", shortDesc),
  ];
  if (brand) {
    attrParts.push(xmlTag("brand", brand));
    attrParts.push(xmlTag("brand_id", brand));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    xmlTag("PrimaryCategory", primaryCategory),
    `<Attributes>${attrParts.join("")}</Attributes>`,
    `<Skus>${skuXml}</Skus>`,
    "</Product></Request>",
  ].join("");
}

function buildUpdateProductXml({ itemId, product, matchedSkus }) {
  const skuXml = matchedSkus.map(({ erpVariant, darazSku }) => [
    "<Sku>",
    xmlTag("SkuId", darazSku.skuId),
    xmlTag("SellerSku", erpVariant.sku || darazSku.sellerSku),
    xmlTag("price", (Number(erpVariant.selling_price) || 0).toFixed(2)),
    "</Sku>",
  ].join("")).join("");

  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    xmlTag("ItemId", itemId),
    "<Attributes>",
    xmlTag("name", product.product_name),
  ];
  if (product.description != null) {
    parts.push(xmlTag("description", product.description || product.product_name || ""));
  }
  parts.push("</Attributes>");
  if (skuXml) parts.push(`<Skus>${skuXml}</Skus>`);
  parts.push("</Product></Request>");
  return parts.join("");
}

function buildPriceQuantityXml({ itemId, rows }) {
  const skuXml = rows.map((row) => {
    const warehouseParts = (row.warehouseQuantities || [])
      .filter((w) => w.warehouseCode)
      .map((w) => [
        "<MultiWarehouseInventory>",
        xmlTag("WarehouseCode", w.warehouseCode),
        xmlTag("Quantity", Math.max(0, Math.floor(Number(w.quantity) || 0))),
        "</MultiWarehouseInventory>",
      ].join(""))
      .join("");

    return [
      "<Sku>",
      xmlTag("ItemId", itemId),
      row.skuId ? xmlTag("SkuId", row.skuId) : "",
      xmlTag("SellerSku", row.sellerSku),
      row.price != null ? xmlTag("Price", Number(row.price).toFixed(2)) : "",
      warehouseParts
        ? `<MultiWarehouseInventories>${warehouseParts}</MultiWarehouseInventories>`
        : row.quantity != null
          ? xmlTag("Quantity", Math.max(0, Math.floor(Number(row.quantity) || 0)))
          : "",
      "</Sku>",
    ].join("");
  }).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    `<Skus>${skuXml}</Skus>`,
    "</Product></Request>",
  ].join("");
}

async function postDarazPayload(store, apiPath, payloadXml) {
  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const data = await darazApiPost(apiBase, apiPath, creds, { payload: payloadXml });
  return unwrapDarazResponse(data);
}

export async function logDarazPushResult(storeId, tenantId, entityType, externalId, result) {
  await addSyncLog(storeId, tenantId, {
    syncType: `erp_push:${entityType}`,
    externalId: String(externalId),
    status: result.ok ? "success" : "failed",
    message: result.ok ? `Pushed ${entityType} to Daraz` : result.error || "Push failed",
  });
}

export async function suggestDarazPrimaryCategory(store, productName) {
  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  try {
    const data = await darazApiGet(apiBase, "/category/suggestion/get", creds, {
      product_name: String(productName || "").slice(0, 200),
    });
    const result = unwrapDarazResponse(data);
    const list = result?.categorySuggestions
      || result?.data
      || result?.category_suggestions
      || [];
    const first = Array.isArray(list) ? list[0] : null;
    const categoryId = first?.categoryId ?? first?.category_id ?? first?.id ?? null;
    return categoryId != null ? String(categoryId) : null;
  } catch {
    return null;
  }
}

/** Return ranked Daraz category suggestions for a product name (UI picker). */
export async function suggestDarazCategories(store, productName, limit = 12) {
  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const data = await darazApiGet(apiBase, "/category/suggestion/get", creds, {
    product_name: String(productName || "").slice(0, 200),
  });
  const result = unwrapDarazResponse(data);
  const list = result?.categorySuggestions
    || result?.data
    || result?.category_suggestions
    || [];
  const rows = Array.isArray(list) ? list : [];
  return rows.slice(0, limit).map((row) => ({
    id: String(row.categoryId ?? row.category_id ?? row.id ?? ""),
    name: row.categoryName || row.category_name || row.name || String(row.categoryId || row.id || ""),
    path: row.categoryPath || row.path || row.category_path || null,
  })).filter((row) => row.id);
}

export async function fetchDarazProductRaw(store, itemId) {
  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const data = await darazApiGet(apiBase, "/product/item/get", creds, {
    item_id: String(itemId),
  });
  const result = unwrapDarazResponse(data);
  return result?.product || result?.data || result || null;
}

export async function createProductInDaraz(store, product, erpVariants = [], options = {}) {
  try {
    let primaryCategory = options.primaryCategoryId
      ? String(options.primaryCategoryId)
      : null;

    if (!primaryCategory) {
      primaryCategory = await suggestDarazPrimaryCategory(store, product.product_name);
    }

    if (!primaryCategory) {
      return {
        ok: false,
        error:
          "Could not resolve a Daraz category for this product. Import a product from Daraz first (to learn categories) or provide a Daraz category id.",
      };
    }

    const stockByVariantId = options.stockByVariantId || {};
    const warehouseQtyByVariantId = options.warehouseQtyByVariantId || {};
    const payload = buildCreateProductXml({
      primaryCategory,
      product,
      erpVariants,
      stockByVariantId,
      warehouseQtyByVariantId,
      packageDims: options.packageDims || {},
      brand: options.brand || "",
      shortDescription: options.shortDescription || "",
    });
    const result = await postDarazPayload(store, "/product/create", payload);
    const itemId =
      result?.item_id
      || result?.ItemId
      || result?.product_id
      || result?.data?.item_id
      || null;

    if (!itemId) {
      return { ok: false, error: "Daraz did not return a product item id" };
    }

    return {
      ok: true,
      externalId: String(itemId),
      action: "created",
      primaryCategory,
    };
  } catch (error) {
    return { ok: false, error: formatDarazError(error) };
  }
}

export async function pushProductToDaraz(
  store,
  externalId,
  product,
  erpVariants = [],
  { beforeProduct = null, stockByVariantId = {}, warehouseQtyByVariantId = {}, darazRaw = null } = {},
) {
  try {
    let raw = darazRaw;
    if (!raw) {
      try {
        raw = await fetchDarazProductRaw(store, externalId);
      } catch {
        raw = null;
      }
    }

    const darazSkus = extractDarazSkus(raw);
    const matched = matchDarazSkusToErpVariants(erpVariants, darazSkus);

    const productChanged = !beforeProduct
      || erpFieldChanged(beforeProduct, product, "product_name")
      || erpFieldChanged(beforeProduct, product, "description")
      || erpFieldChanged(beforeProduct, product, "status");

    if (productChanged || matched.length) {
      const payload = buildUpdateProductXml({
        itemId: externalId,
        product,
        matchedSkus: matched,
      });
      await postDarazPayload(store, "/product/update", payload);
    }

    const priceQtyRows = [];
    for (const { erpVariant, darazSku } of matched.length
      ? matched
      : erpVariants.map((erpVariant) => ({
          erpVariant,
          darazSku: { sellerSku: erpVariant.sku, skuId: null },
        }))) {
      const qty = stockByVariantId[erpVariant.id] != null
        ? Math.max(0, Math.floor(Number(stockByVariantId[erpVariant.id]) || 0))
        : null;
      const warehouseQuantities = warehouseQtyByVariantId[erpVariant.id] || [];
      priceQtyRows.push({
        skuId: darazSku.skuId,
        sellerSku: erpVariant.sku || darazSku.sellerSku,
        price: Number(erpVariant.selling_price) || 0,
        quantity: warehouseQuantities.length ? undefined : qty,
        warehouseQuantities,
      });
    }

    if (priceQtyRows.length) {
      const pqPayload = buildPriceQuantityXml({ itemId: externalId, rows: priceQtyRows });
      await postDarazPayload(store, "/product/price_quantity/update", pqPayload);
    }

    if (product.status === "inactive") {
      try {
        await postDarazPayload(
          store,
          "/product/deactivate",
          `<?xml version="1.0" encoding="UTF-8"?><Request><Product><ItemId>${escapeXml(externalId)}</ItemId></Product></Request>`,
        );
      } catch {
        // Some marketplaces reject deactivate; update already pushed status fields when supported.
      }
    }

    return { ok: true, externalId: String(externalId), action: "updated" };
  } catch (error) {
    return { ok: false, error: formatDarazError(error) };
  }
}

export async function pushProductPriceQuantityToDaraz(store, { itemId, rows }) {
  try {
    if (!itemId || !rows?.length) {
      return { ok: false, skipped: true, reason: "no_skus" };
    }
    const payload = buildPriceQuantityXml({ itemId, rows });
    await postDarazPayload(store, "/product/price_quantity/update", payload);
    return { ok: true, externalId: String(itemId), action: "updated" };
  } catch (error) {
    return { ok: false, error: formatDarazError(error) };
  }
}

export async function deactivateProductInDaraz(store, externalId) {
  try {
    await postDarazPayload(
      store,
      "/product/deactivate",
      `<?xml version="1.0" encoding="UTF-8"?><Request><Product><ItemId>${escapeXml(externalId)}</ItemId></Product></Request>`,
    );
    return { ok: true, externalId: String(externalId), action: "deactivated" };
  } catch (error) {
    return { ok: false, error: formatDarazError(error) };
  }
}

export { extractDarazSkus, totalAvailableQty };
