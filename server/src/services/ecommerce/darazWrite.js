import {
  darazApiGet,
  darazApiPost,
  unwrapDarazResponse,
  darazCredentialsForStore,
  apiBaseFromStore,
  formatDarazPrice,
  formatDarazDetail,
  darazPriceDecimals,
} from "./darazClient.js";
import { addSyncLog } from "../../repositories/ecommerceRepository.js";

export function formatDarazError(error) {
  const data = error?.response?.data;
  if (data) {
    const code = data.code != null ? String(data.code) : "";
    const msg = data.message || data.msg || (code ? `Daraz API error ${code}` : "Daraz API error");
    const detailText = formatDarazDetail(data.detail ?? data.details ?? data.error_detail)
      || error?.darazDetail
      || "";
    let full = code && code !== "0" && !String(msg).includes(code) ? `${code}: ${msg}` : msg;
    if (detailText && !full.includes(detailText)) {
      full = `${full} (${detailText})`;
    }
    return humanizeDarazError(full, code);
  }
  if (error?.message) return humanizeDarazError(error.message, error?.darazCode);
  return "Daraz request failed";
}

/** Map known Daraz codes to clearer copy while keeping API detail. */
export function humanizeDarazError(message, code = "") {
  const text = String(message || "").trim();
  const c = String(code || "");
  const lower = text.toLowerCase();
  if (c === "4104" || /4104|price.?precision|biz_check_price_precision/i.test(text)) {
    return `${text}. Use a whole-number price for Daraz Pakistan (e.g. 1500), with no decimals.`;
  }
  if (/e500|create product failed|system_exception/i.test(lower)) {
    return (
      `${text}. Common fixes: use brand "No Brand" (or an exact Daraz brand name), `
      + "a unique Seller SKU, a whole-number price, and a valid leaf category. "
      + "If you already have this SKU on Daraz, edit that product instead of creating a new one."
    );
  }
  if (/campaign|locked|tag/i.test(lower) && /501|e501|update product failed/i.test(lower)) {
    return `${text}. This product may be locked by a Daraz campaign — wait until the campaign ends or update stock/price in Seller Center.`;
  }
  if (/sku.?not.?found|seller.?sku|could not match/i.test(lower)) {
    return text;
  }
  return text || "Daraz request failed";
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

export function extractDarazBrand(raw) {
  if (!raw) return null;
  const attrs = raw.attributes || raw.Attributes || {};
  const brand =
    attrs.brand
    || attrs.Brand
    || raw.brand
    || raw.Brand
    || null;
  return brand != null && String(brand).trim() ? String(brand).trim() : null;
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

function warehouseQtySignature(rows = []) {
  return (rows || [])
    .map((w) => `${w.warehouseCode || ""}:${Math.max(0, Math.floor(Number(w.quantity) || 0))}`)
    .sort()
    .join("|");
}

function priceQtyNeedsPush(matched, stockByVariantId, warehouseQtyByVariantId, beforeProduct, forceFullPush) {
  if (forceFullPush || !beforeProduct) return true;
  for (const { erpVariant, darazSku } of matched) {
    const erpPrice = Number(erpVariant.selling_price) || 0;
    const darazPrice = Number(darazSku.price) || 0;
    if (Math.abs(erpPrice - darazPrice) > 0.0001) return true;

    const warehouseQuantities = warehouseQtyByVariantId[erpVariant.id] || [];
    if (warehouseQuantities.length) {
      // Always push mapped warehouse stock when provided — Daraz multi-WH is source of truth for ERP stock push.
      return true;
    }
    const qty = stockByVariantId[erpVariant.id];
    if (qty != null && Math.max(0, Math.floor(Number(qty) || 0)) !== darazSku.quantity) {
      return true;
    }
  }
  return false;
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
  apiBase,
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
    const price = formatDarazPrice(v.selling_price, apiBase);
    // Single-warehouse / most PK sellers: use aggregate Quantity only.
    // MultiWarehouseInventories on create often triggers E500 SYSTEM_EXCEPTION.
    const whRows = (warehouseQtyByVariantId[v.id] || []).filter((w) => w.warehouseCode);
    const useMultiWh = whRows.length > 1;
    const warehouseParts = useMultiWh
      ? whRows
        .map((w) => [
          "<MultiWarehouseInventory>",
          xmlTag("WarehouseCode", w.warehouseCode),
          xmlTag("Quantity", Math.max(0, Math.floor(Number(w.quantity) || 0))),
          "</MultiWarehouseInventory>",
        ].join(""))
        .join("")
      : "";
    const qtyValue = useMultiWh
      ? null
      : (whRows.length === 1
        ? Math.max(0, Math.floor(Number(whRows[0].quantity) || 0))
        : qty);

    return [
      "<Sku>",
      xmlTag("SellerSku", v.sku),
      warehouseParts
        ? `<MultiWarehouseInventories>${warehouseParts}</MultiWarehouseInventories>`
        : xmlTag("quantity", qtyValue ?? 0),
      xmlTag("price", price),
      xmlTag("package_length", length),
      xmlTag("package_width", width),
      xmlTag("package_height", height),
      xmlTag("package_weight", weight),
      "</Sku>",
    ].join("");
  }).join("");

  const description = product.description || product.product_name || "";
  const shortDesc = shortDescription || description.slice(0, 250);
  const brandName = String(brand || "").trim() || "No Brand";
  // PK Seller Center: name_en = primary Product Name; name = secondary (e.g. Urdu).
  const title = String(product.product_name || "").trim();
  const attrParts = [
    xmlTag("name_en", title),
    xmlTag("name", title),
    xmlTag("description", description),
    xmlTag("short_description", shortDesc),
    // Brand name only — brand_id must be a numeric Daraz brand id, not the name string.
    xmlTag("brand", brandName),
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    xmlTag("PrimaryCategory", primaryCategory),
    `<Attributes>${attrParts.join("")}</Attributes>`,
    `<Skus>${skuXml}</Skus>`,
    "</Product></Request>",
  ].join("");
}

/** Attributes + SKU identity only — never send price here (use price_quantity). */
function buildUpdateProductXml({ itemId, product, matchedSkus, skuStatus = null }) {
  const skuXml = matchedSkus.map(({ erpVariant, darazSku }) => [
    "<Sku>",
    darazSku.skuId ? xmlTag("SkuId", darazSku.skuId) : "",
    xmlTag("SellerSku", erpVariant.sku || darazSku.sellerSku),
    skuStatus ? xmlTag("Status", skuStatus) : "",
    "</Sku>",
  ].join("")).join("");

  // PK Seller Center: name_en is the primary Product Name field; `name` is secondary/locale.
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    xmlTag("ItemId", itemId),
    "<Attributes>",
    xmlTag("name_en", product.product_name),
  ];
  if (product.description != null) {
    parts.push(xmlTag("description", product.description || product.product_name || ""));
  }
  parts.push("</Attributes>");
  if (skuXml) parts.push(`<Skus>${skuXml}</Skus>`);
  parts.push("</Product></Request>");
  return parts.join("");
}

function buildActivateSkuStatusBody(itemId, skus = [], status = "active") {
  const skuRows = (skus || [])
    .filter((s) => s.skuId || s.sellerSku)
    .map((s) => {
      const row = { Status: status };
      if (s.skuId) row.SkuId = Number(s.skuId) || s.skuId;
      if (s.sellerSku) row.SellerSku = s.sellerSku;
      return row;
    });
  const product = { ItemId: Number(itemId) || String(itemId) };
  if (skuRows.length) product.Skus = { Sku: skuRows };
  return JSON.stringify({ Request: { Product: product } });
}

function buildActivateSkuStatusXml(itemId, skus = [], status = "active") {
  const skuXml = (skus || [])
    .filter((s) => s.skuId || s.sellerSku)
    .map((s) => [
      "<Sku>",
      s.skuId ? xmlTag("SkuId", s.skuId) : "",
      s.sellerSku ? xmlTag("SellerSku", s.sellerSku) : "",
      xmlTag("Status", status),
      "</Sku>",
    ].join(""))
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    xmlTag("ItemId", itemId),
    skuXml ? `<Skus>${skuXml}</Skus>` : "",
    "</Product></Request>",
  ].join("");
}

function buildPriceQuantityXml({ itemId, rows, apiBase }) {
  const skuXml = rows.map((row) => {
    const whRows = (row.warehouseQuantities || []).filter((w) => w.warehouseCode);
    // Only use multi-warehouse XML when there are 2+ warehouses; otherwise Quantity is safer.
    const useMultiWh = whRows.length > 1;
    const warehouseParts = useMultiWh
      ? whRows
        .map((w) => [
          "<MultiWarehouseInventory>",
          xmlTag("WarehouseCode", w.warehouseCode),
          xmlTag("Quantity", Math.max(0, Math.floor(Number(w.quantity) || 0))),
          "</MultiWarehouseInventory>",
        ].join(""))
        .join("")
      : "";
    const qty = useMultiWh
      ? null
      : (whRows.length === 1
        ? Math.max(0, Math.floor(Number(whRows[0].quantity) || 0))
        : (row.quantity != null ? Math.max(0, Math.floor(Number(row.quantity) || 0)) : null));

    return [
      "<Sku>",
      xmlTag("ItemId", itemId),
      row.skuId ? xmlTag("SkuId", row.skuId) : "",
      xmlTag("SellerSku", row.sellerSku),
      row.price != null ? xmlTag("Price", formatDarazPrice(row.price, apiBase)) : "",
      warehouseParts
        ? `<MultiWarehouseInventories>${warehouseParts}</MultiWarehouseInventories>`
        : qty != null
          ? xmlTag("Quantity", qty)
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
    const apiBase = apiBaseFromStore(store);
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
      brand: options.brand || "No Brand",
      shortDescription: options.shortDescription || "",
      apiBase,
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

    if (String(product.status || "").toLowerCase() === "inactive") {
      const deactivated = await deactivateProductInDaraz(store, itemId);
      if (!deactivated.ok) {
        return {
          ok: false,
          error: `Product created on Daraz but could not be set inactive: ${deactivated.error}`,
          externalId: String(itemId),
        };
      }
      return {
        ok: true,
        externalId: String(itemId),
        action: "created_inactive",
        primaryCategory,
      };
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
  {
    beforeProduct = null,
    stockByVariantId = {},
    warehouseQtyByVariantId = {},
    darazRaw = null,
    forceFullPush = false,
  } = {},
) {
  try {
    const apiBase = apiBaseFromStore(store);
    let raw = darazRaw;
    if (!raw) {
      try {
        raw = await fetchDarazProductRaw(store, externalId);
      } catch (fetchErr) {
        return {
          ok: false,
          error: `Could not load Daraz product ${externalId}: ${formatDarazError(fetchErr)}`,
        };
      }
    }
    if (!raw) {
      return {
        ok: false,
        error: `Daraz product ${externalId} was not found. Re-link the product or import it from Daraz again.`,
      };
    }

    const darazSkus = extractDarazSkus(raw);
    const matched = matchDarazSkusToErpVariants(erpVariants, darazSkus);

    if (!matched.length && erpVariants.length) {
      const erpSkus = erpVariants.map((v) => v.sku).filter(Boolean).join(", ") || "(none)";
      const darazSkuList = darazSkus.map((s) => s.sellerSku).filter(Boolean).join(", ") || "(none)";
      return {
        ok: false,
        error:
          `Could not match ERP Seller SKUs [${erpSkus}] to Daraz SKUs [${darazSkuList}]. `
          + "Use the same Seller SKU as on Daraz, then save again.",
      };
    }

    const statusChanged = !beforeProduct
      || forceFullPush
      || erpFieldChanged(beforeProduct, product, "status");
    const erpInactive = String(product.status || "").toLowerCase() === "inactive";
    const attrsChanged = !beforeProduct
      || forceFullPush
      || erpFieldChanged(beforeProduct, product, "product_name")
      || erpFieldChanged(beforeProduct, product, "description");

    // Status first — Daraz rejects most updates while inactive, and activate is a separate path.
    if (statusChanged || erpInactive) {
      if (erpInactive) {
        const deactivated = await deactivateProductInDaraz(store, externalId);
        if (!deactivated.ok) {
          return { ok: false, error: `Could not set Daraz product inactive: ${deactivated.error}` };
        }
        // Skip attribute/price pushes while inactive — Seller Center keeps the last active data.
        if (!attrsChanged && !forceFullPush) {
          return { ok: true, externalId: String(externalId), action: "deactivated" };
        }
      } else if (statusChanged) {
        const activated = await activateProductInDaraz(store, externalId, { skus: darazSkus });
        if (!activated.ok) {
          return { ok: false, error: `Could not set Daraz product active: ${activated.error}` };
        }
      }
    }

    // Attributes only — price goes through price_quantity to avoid 4104 on /product/update.
    // Prefer updating while active; if still inactive after failed activate, skip.
    if (!erpInactive && attrsChanged) {
      const payload = buildUpdateProductXml({
        itemId: externalId,
        product,
        matchedSkus: matched,
      });
      await postDarazPayload(store, "/product/update", payload);
    }

    const needPriceQty = !erpInactive
      && matched.length > 0
      && priceQtyNeedsPush(
        matched,
        stockByVariantId,
        warehouseQtyByVariantId,
        beforeProduct,
        forceFullPush,
      );

    if (needPriceQty) {
      const priceQtyRows = matched.map(({ erpVariant, darazSku }) => {
        const qty = stockByVariantId[erpVariant.id] != null
          ? Math.max(0, Math.floor(Number(stockByVariantId[erpVariant.id]) || 0))
          : null;
        const warehouseQuantities = warehouseQtyByVariantId[erpVariant.id] || [];
        return {
          skuId: darazSku.skuId,
          sellerSku: erpVariant.sku || darazSku.sellerSku,
          price: Number(erpVariant.selling_price) || 0,
          quantity: warehouseQuantities.length ? undefined : qty,
          warehouseQuantities,
        };
      });

      try {
        const pqPayload = buildPriceQuantityXml({ itemId: externalId, rows: priceQtyRows, apiBase });
        await postDarazPayload(store, "/product/price_quantity/update", pqPayload);
      } catch (pqError) {
        return { ok: false, error: formatDarazError(pqError) };
      }
    }

    return {
      ok: true,
      externalId: String(externalId),
      action: erpInactive ? "deactivated" : (statusChanged ? "activated_updated" : "updated"),
    };
  } catch (error) {
    return { ok: false, error: formatDarazError(error) };
  }
}

export async function pushProductPriceQuantityToDaraz(store, { itemId, rows }) {
  try {
    if (!itemId || !rows?.length) {
      return { ok: false, skipped: true, reason: "no_skus" };
    }
    const apiBase = apiBaseFromStore(store);
    const payload = buildPriceQuantityXml({ itemId, rows, apiBase });
    await postDarazPayload(store, "/product/price_quantity/update", payload);
    return { ok: true, externalId: String(itemId), action: "updated" };
  } catch (error) {
    return { ok: false, error: formatDarazError(error) };
  }
}

function isDarazAlreadyGone(error) {
  const text = String(error?.message || formatDarazError(error) || "").toLowerCase();
  const code = String(error?.darazCode || error?.response?.data?.code || "");
  return (
    /not\s*found|does\s*not\s*exist|already\s*(inactive|deactivated|deleted)|item.?id.?invalid|no\s*product/i.test(text)
    || ["404", "NOT_FOUND", "E100", "100"].includes(code)
  );
}

function buildDeactivateRequestBody(itemId, skuIds = []) {
  const product = { ItemId: Number(itemId) || String(itemId) };
  const ids = (skuIds || []).map((id) => Number(id) || String(id)).filter(Boolean);
  if (ids.length) {
    product.Skus = { SkuId: ids };
  }
  return JSON.stringify({ Request: { Product: product } });
}

function buildDeactivateXml(itemId, skuIds = []) {
  const skuXml = (skuIds || [])
    .filter(Boolean)
    .map((id) => xmlTag("SkuId", id))
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Request><Product>",
    xmlTag("ItemId", itemId),
    skuXml ? `<Skus>${skuXml}</Skus>` : "",
    "</Product></Request>",
  ].join("");
}

/**
 * Deactivate a Daraz product. Open Platform expects `apiRequestBody` (JSON);
 * older seller-center style used `payload` XML — try both.
 */
export async function deactivateProductInDaraz(store, externalId) {
  const itemId = String(externalId || "").trim();
  if (!itemId) return { ok: false, error: "Missing Daraz item id" };

  let skuIds = [];
  try {
    const raw = await fetchDarazProductRaw(store, itemId);
    const status = String(raw?.status || raw?.Status || "").toLowerCase();
    const skus = extractDarazSkus(raw);
    skuIds = skus.map((s) => s.skuId).filter(Boolean);
    const allSkusInactive = skus.length > 0 && skus.every((s) => {
      const st = String(s.status || "").toLowerCase();
      return ["inactive", "deleted", "rejected", "suspended"].includes(st);
    });
    if (
      ["inactive", "deleted", "rejected", "suspended"].includes(status)
      || allSkusInactive
    ) {
      return { ok: true, externalId: itemId, action: "already_inactive" };
    }
  } catch (error) {
    if (isDarazAlreadyGone(error)) {
      return { ok: true, externalId: itemId, action: "already_gone" };
    }
    // Continue — deactivate may still succeed without a product fetch.
  }

  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const attempts = [
    { apiRequestBody: buildDeactivateRequestBody(itemId, skuIds) },
    { apiRequestBody: buildDeactivateRequestBody(itemId, []) },
    { payload: buildDeactivateXml(itemId, skuIds) },
    { payload: buildDeactivateXml(itemId, []) },
  ];

  let lastError = null;
  for (const params of attempts) {
    try {
      const data = await darazApiPost(apiBase, "/product/deactivate", creds, params);
      unwrapDarazResponse(data);
      return { ok: true, externalId: itemId, action: "deactivated" };
    } catch (error) {
      lastError = error;
      if (isDarazAlreadyGone(error)) {
        return { ok: true, externalId: itemId, action: "already_gone" };
      }
    }
  }

  return { ok: false, error: formatDarazError(lastError) };
}

/**
 * Reactivate a Daraz product/SKUs via /product/update Status=active.
 * There is no dedicated ActivateProduct API on Daraz Open Platform.
 */
export async function activateProductInDaraz(store, externalId, { skus: skusHint = null } = {}) {
  const itemId = String(externalId || "").trim();
  if (!itemId) return { ok: false, error: "Missing Daraz item id" };

  let skus = Array.isArray(skusHint) ? skusHint : [];
  try {
    const raw = await fetchDarazProductRaw(store, itemId);
    const status = String(raw?.status || raw?.Status || "").toLowerCase();
    const extracted = extractDarazSkus(raw);
    if (extracted.length) skus = extracted;
    const allActive = extracted.length
      ? extracted.every((s) => String(s.status || "").toLowerCase() === "active")
      : status === "active" || status === "live";
    if (allActive && (status === "active" || status === "live" || !status || status === "unknown")) {
      // Item may already be sellable; still push Status=active to clear SKU-level inactive.
      const anyInactiveSku = extracted.some((s) => {
        const st = String(s.status || "").toLowerCase();
        return st && st !== "active";
      });
      if (!anyInactiveSku && (status === "active" || status === "live")) {
        return { ok: true, externalId: itemId, action: "already_active" };
      }
    }
  } catch (error) {
    if (isDarazAlreadyGone(error)) {
      return { ok: false, error: formatDarazError(error) };
    }
  }

  if (!skus.length) {
    return { ok: false, error: "No Daraz SKUs found to activate" };
  }

  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const attempts = [
    { apiRequestBody: buildActivateSkuStatusBody(itemId, skus, "active") },
    { apiRequestBody: buildActivateSkuStatusBody(itemId, skus, "Active") },
    { payload: buildActivateSkuStatusXml(itemId, skus, "active") },
    { payload: buildActivateSkuStatusXml(itemId, skus, "Active") },
  ];

  let lastError = null;
  for (const params of attempts) {
    try {
      const data = await darazApiPost(apiBase, "/product/update", creds, params);
      unwrapDarazResponse(data);
      return { ok: true, externalId: itemId, action: "activated" };
    } catch (error) {
      lastError = error;
    }
  }

  return { ok: false, error: formatDarazError(lastError) };
}

/**
 * Permanently remove a Daraz product (or its SKUs) via /product/remove.
 * Prefers sku_id_list (SkuId_{itemId}_{skuId}); falls back to seller_sku_list.
 */
export async function removeProductFromDaraz(store, externalId) {
  const itemId = String(externalId || "").trim();
  if (!itemId) return { ok: false, error: "Missing Daraz item id" };

  let skuIds = [];
  let sellerSkus = [];
  try {
    const raw = await fetchDarazProductRaw(store, itemId);
    const skus = extractDarazSkus(raw);
    skuIds = skus.map((s) => s.skuId).filter(Boolean);
    sellerSkus = skus.map((s) => s.sellerSku).filter(Boolean);
  } catch (error) {
    if (isDarazAlreadyGone(error)) {
      return { ok: true, externalId: itemId, action: "already_gone" };
    }
  }

  const creds = darazCredentialsForStore(store);
  const apiBase = apiBaseFromStore(store);
  const skuIdList = skuIds.map((skuId) => `SkuId_${itemId}_${skuId}`);
  const attempts = [];
  if (skuIdList.length) {
    attempts.push({ sku_id_list: JSON.stringify(skuIdList) });
  }
  if (sellerSkus.length) {
    attempts.push({ seller_sku_list: JSON.stringify(sellerSkus) });
  }
  // Last resort: deactivate again if remove has nothing to target / already gone.
  if (!attempts.length) {
    const deactivated = await deactivateProductInDaraz(store, itemId);
    if (deactivated.ok) {
      return { ok: true, externalId: itemId, action: "deactivated_no_skus" };
    }
    return { ok: false, error: deactivated.error || "No Daraz SKUs found to remove" };
  }

  let lastError = null;
  for (const params of attempts) {
    try {
      const data = await darazApiPost(apiBase, "/product/remove", creds, params);
      unwrapDarazResponse(data);
      return { ok: true, externalId: itemId, action: "removed" };
    } catch (error) {
      lastError = error;
      if (isDarazAlreadyGone(error)) {
        return { ok: true, externalId: itemId, action: "already_gone" };
      }
    }
  }

  return { ok: false, error: formatDarazError(lastError) };
}

export {
  extractDarazSkus,
  totalAvailableQty,
  formatDarazPrice,
  darazPriceDecimals,
  warehouseQtySignature,
};
