import { shopifyClient, shopifyGraphqlClient } from "./shopifyClient.js";
import { formatShopifyError } from "./shopifyErrors.js";
import { addSyncLog, getEntityLinkByInternalId } from "../../repositories/ecommerceRepository.js";
import { inventoryRepository } from "../../repositories/inventoryRepository.js";
import { toShopifyPhone } from "../../utils/phoneE164.js";

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "Customer", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function normalizeStr(value) {
  return String(value ?? "").trim();
}

/** REST/GraphQL IDs may arrive as numbers, numeric strings, or Shopify GIDs. */
export function parseShopifyNumericId(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const gidMatch = raw.match(/\/(\d+)\s*$/);
  if (gidMatch) return Number(gidMatch[1]);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function ensureVariantInventoryTracking(store, inventoryItemId) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const itemId = parseShopifyNumericId(inventoryItemId);
  if (!itemId) return false;
  try {
    const { data } = await client.get(`/inventory_items/${itemId}.json`);
    const variantId = data?.inventory_item?.variant_id;
    if (!variantId) return false;
    await client.put(`/variants/${variantId}.json`, {
      variant: {
        id: variantId,
        inventory_management: "shopify",
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function connectInventoryAtLocation(client, locationId, inventoryItemId) {
  await client.post("/inventory_levels/connect.json", {
    location_id: locationId,
    inventory_item_id: inventoryItemId,
  });
}

function inventoryNotTrackedMessage(msg) {
  return /not tracked|inventory tracking|inventory_management|does not have inventory/i.test(String(msg || ""));
}

function erpFieldChanged(before, after, key) {
  if (!before) return true;
  return normalizeStr(before[key]) !== normalizeStr(after[key]);
}

function normalizeTagsValue(tags) {
  if (!tags) return "";
  if (Array.isArray(tags)) {
    return tags
      .map((t) => (typeof t === "string" ? t : t.tag_name || ""))
      .map((t) => normalizeStr(t))
      .filter(Boolean)
      .sort()
      .join(", ");
  }
  return normalizeStr(tags);
}

function tagsChanged(before, after) {
  if (!before) return Boolean(normalizeTagsValue(after?.tags));
  return normalizeTagsValue(before.tags) !== normalizeTagsValue(after?.tags);
}

function shopifyCustomerAddressPayload(customer, address, { includeCompany = false } = {}) {
  const { first_name, last_name } = splitName(customer.customer_name);
  const phone = toShopifyPhone(customer.phone);
  return {
    first_name,
    last_name,
    ...(includeCompany ? { company: customer.company_name || undefined } : { company: "" }),
    phone: phone || undefined,
    address1: address?.address || undefined,
    city: address?.city || undefined,
    province: address?.state || undefined,
    zip: address?.postal_code || undefined,
    country: address?.country || undefined,
  };
}

function erpAddressesForShopify(customer) {
  const list = Array.isArray(customer.addresses) ? customer.addresses : [];
  return list.filter((a) => String(a?.address || "").trim() || String(a?.city || "").trim());
}

function addressMatchKey(address = {}) {
  return [
    normalizeStr(address.address1 || address.address).toLowerCase(),
    normalizeStr(address.city).toLowerCase(),
    normalizeStr(address.zip || address.postal_code).toLowerCase(),
  ].join("|");
}

/** MySQL TINYINT may arrive as 0/1, true/false, or Buffer — never use Boolean(buffer). */
function coerceFlag(value) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0" || value == null || value === "") return false;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] !== 0;
  }
  return false;
}

function isErpDefaultAddress(address) {
  if (coerceFlag(address?.is_default)) return true;
  const type = String(address?.address_type || "").trim().toLowerCase();
  if (type !== "default") return false;
  // Explicit non-default flag wins over a stale "default" type label.
  if (
    address?.is_default === false
    || address?.is_default === 0
    || address?.is_default === "0"
    || (typeof Buffer !== "undefined" && Buffer.isBuffer(address?.is_default) && address.is_default[0] === 0)
  ) {
    return false;
  }
  return true;
}

/** Exactly one default: prefer address_type/is_default, else first row. */
function withSingleDefault(addresses) {
  const list = addresses.map((a) => ({ ...a }));
  let defaultIdx = list.findIndex((a) => isErpDefaultAddress(a));
  if (defaultIdx < 0) defaultIdx = list.length ? 0 : -1;
  return list.map((a, i) => ({
    ...a,
    is_default: i === defaultIdx ? 1 : 0,
    address_type: i === defaultIdx ? "default" : (String(a.address_type || "").toLowerCase() === "default" ? "office" : a.address_type),
  }));
}

/** Prefer default row when ERP has duplicate street/city rows. */
function dedupeErpAddresses(addresses) {
  const map = new Map();
  for (const address of addresses) {
    const key = addressMatchKey(address);
    if (!key || key === "||") continue;
    const prev = map.get(key);
    if (!prev || isErpDefaultAddress(address)) {
      map.set(key, address);
    }
  }
  return withSingleDefault([...map.values()]);
}

function addressesNeedPush(beforeCustomer, customer) {
  if (!beforeCustomer) return true;
  if (erpFieldChanged(beforeCustomer, customer, "phone")) return true;
  if (erpFieldChanged(beforeCustomer, customer, "customer_name")) return true;
  if (erpFieldChanged(beforeCustomer, customer, "company_name")) return true;
  const before = dedupeErpAddresses(erpAddressesForShopify(beforeCustomer))
    .map((a) => `${addressMatchKey(a)}|${isErpDefaultAddress(a) ? 1 : 0}`)
    .sort()
    .join(";");
  const after = dedupeErpAddresses(erpAddressesForShopify(customer))
    .map((a) => `${addressMatchKey(a)}|${isErpDefaultAddress(a) ? 1 : 0}`)
    .sort()
    .join(";");
  return before !== after;
}

async function syncAllCustomerAddressesToShopify(client, externalId, customer) {
  const erpAddresses = dedupeErpAddresses(erpAddressesForShopify(customer));
  if (!erpAddresses.length && !customer.company_name) return;

  const { data } = await client.get(`/customers/${externalId}/addresses.json`);
  const shopifyAddresses = Array.isArray(data?.addresses) ? [...data.addresses] : [];
  const usedShopifyIds = new Set();

  // Exactly one default, processed first so we never POST a second default.
  const ordered = withSingleDefault(erpAddresses);
  ordered.sort((a, b) => Number(isErpDefaultAddress(b)) - Number(isErpDefaultAddress(a)));

  let defaultShopifyId = null;
  const shopifyDefault = shopifyAddresses.find((sa) => sa.default) || null;

  for (const erpAddr of ordered) {
    const isDefault = isErpDefaultAddress(erpAddr);
    const payload = shopifyCustomerAddressPayload(customer, erpAddr, {
      includeCompany: isDefault,
    });
    const key = addressMatchKey(erpAddr);

    // Match by street/city/zip only — never attach a non-default ERP row to Shopify's default.
    let match = shopifyAddresses.find(
      (sa) => !usedShopifyIds.has(sa.id) && addressMatchKey(sa) === key,
    );

    // ERP default may reuse Shopify's current default slot when streets differ (in-place update).
    if (!match && isDefault && shopifyDefault && !usedShopifyIds.has(shopifyDefault.id)) {
      match = shopifyDefault;
    }

    if (match?.id) {
      usedShopifyIds.add(match.id);
      await client.put(`/customers/${externalId}/addresses/${match.id}.json`, {
        address: { id: match.id, ...payload },
      });
      if (isDefault) defaultShopifyId = match.id;
      continue;
    }

    const { data: created } = await client.post(`/customers/${externalId}/addresses.json`, {
      address: { ...payload, default: isDefault || undefined },
    });
    const newId = created?.customer_address?.id;
    if (newId) {
      usedShopifyIds.add(newId);
      shopifyAddresses.push(created.customer_address || { id: newId, ...payload });
      if (isDefault) defaultShopifyId = newId;
    }
  }

  if (defaultShopifyId) {
    await client.put(`/customers/${externalId}/addresses/${defaultShopifyId}/default.json`, {});
  }

  // Drop any Shopify address that does not map to an ERP row (leftover default copies, etc.).
  for (const sa of shopifyAddresses) {
    if (!sa?.id || usedShopifyIds.has(sa.id)) continue;
    try {
      await client.delete(`/customers/${externalId}/addresses/${sa.id}.json`);
    } catch {
      // ignore — Shopify may refuse deleting the sole/default address
    }
  }
}

export async function pushCustomerToShopify(store, externalId, customer, { beforeCustomer = null } = {}) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const { first_name, last_name } = splitName(customer.customer_name);
  const tags = customerTags(customer);
  try {
    const customerPayload = { id: Number(externalId) };
    let hasCustomerFields = false;
    if (!beforeCustomer || erpFieldChanged(beforeCustomer, customer, "customer_name")) {
      customerPayload.first_name = first_name;
      customerPayload.last_name = last_name;
      hasCustomerFields = true;
    }
    if (!beforeCustomer || erpFieldChanged(beforeCustomer, customer, "email")) {
      customerPayload.email = customer.email || undefined;
      hasCustomerFields = true;
    }
    if (!beforeCustomer || erpFieldChanged(beforeCustomer, customer, "phone")) {
      const rawPhone = String(customer.phone || "").trim();
      if (rawPhone) {
        const e164 = toShopifyPhone(rawPhone);
        if (!e164) {
          return {
            ok: false,
            error: `Phone "${rawPhone}" is not valid for Shopify. Use a format like 03001234567 or +923001234567.`,
          };
        }
        customerPayload.phone = e164;
        hasCustomerFields = true;
      }
    }
    if (!beforeCustomer || erpFieldChanged(beforeCustomer, customer, "note")) {
      customerPayload.note = customer.note || "";
      hasCustomerFields = true;
    }
    if (!beforeCustomer || tagsChanged(beforeCustomer, customer)) {
      customerPayload.tags = tags !== undefined ? tags : undefined;
      hasCustomerFields = true;
    }
    if (hasCustomerFields) {
      await client.put(`/customers/${externalId}.json`, { customer: customerPayload });
    }

    if (addressesNeedPush(beforeCustomer, customer)) {
      try {
        await syncAllCustomerAddressesToShopify(client, externalId, customer);
      } catch (addrError) {
        return { ok: false, error: `Customer saved but address failed: ${formatShopifyError(addrError)}` };
      }
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function deleteCustomerFromShopify(store, externalId) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await client.delete(`/customers/${externalId}.json`);
    return { ok: true, action: "deleted" };
  } catch (error) {
    const msg = formatShopifyError(error);
    if (/not found|404|does not exist/i.test(msg)) {
      return { ok: true, action: "already_deleted" };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Phase 1 of deferred delete: keep the customer, append ERP deletion note + tag.
 * Hard DELETE happens later via the pending-deletes job.
 */
export async function markCustomerPendingDeleteInShopify(store, externalId, noteLine) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.get(`/customers/${externalId}.json`);
    const customer = data?.customer;
    if (!customer) return { ok: false, error: "Shopify customer not found" };

    const existingNote = String(customer.note || "").trim();
    const note = existingNote ? `${existingNote}\n${noteLine}` : noteLine;
    const existingTags = String(customer.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = [...new Set([...existingTags, "erp-pending-delete"])].join(", ");

    await client.put(`/customers/${externalId}.json`, {
      customer: { id: Number(externalId), note, tags },
    });
    return { ok: true, action: "noted_pending_delete", shopifyNote: noteLine };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

function shopifyVariantOptionKey(variant = {}) {
  return [variant.option1, variant.option2, variant.option3]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join("||");
}

function findShopifyVariantMatch(
  erpV,
  shopifyVariants,
  usedShopifyIds,
  shopifyBySku,
  erpVariantCount,
  optionNames = null,
) {
  const skuKey = String(erpV.sku || "").trim().toLowerCase();
  if (skuKey && shopifyBySku.has(skuKey)) {
    const bySku = shopifyBySku.get(skuKey);
    if (!usedShopifyIds.has(bySku.id)) return bySku;
  }

  const erpKey = shopifyVariantOptionKey(shopifyVariantPayload(erpV, optionNames));
  if (erpKey) {
    for (const sv of shopifyVariants) {
      if (usedShopifyIds.has(sv.id)) continue;
      if (shopifyVariantOptionKey(sv) === erpKey) return sv;
    }
  }

  if (erpVariantCount === 1) {
    for (const sv of shopifyVariants) {
      if (!usedShopifyIds.has(sv.id)) return sv;
    }
  }

  return null;
}

function variantFieldsChanged(beforeVariant, erpVariant) {
  if (!beforeVariant) return true;
  return ["sku", "selling_price", "cost_price", "status"].some(
    (key) => normalizeStr(beforeVariant[key]) !== normalizeStr(erpVariant[key]),
  );
}

export async function pushProductToShopify(store, externalId, product, erpVariants = [], { beforeProduct = null } = {}) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const variants = Array.isArray(erpVariants) ? erpVariants : erpVariants ? [erpVariants] : [];

  try {
    const { data } = await client.get(`/products/${externalId}.json`);
    const shopifyProduct = data.product;
    if (!shopifyProduct) return { ok: false, error: "Shopify product not found" };

    let shopifyVariants = shopifyProduct.variants || [];
    const shopifyBySku = new Map();
    for (const sv of shopifyVariants) {
      const sku = String(sv.sku || "").trim().toLowerCase();
      if (sku) shopifyBySku.set(sku, sv);
    }

    const { options, variants: optionOrderedVariants } = buildShopifyProductOptions(variants);
    const optionNames = options?.map((o) => o.name) || [];
    const variantList = optionOrderedVariants.length ? optionOrderedVariants : variants;

    const usedShopifyIds = new Set();
    const erpToShopify = new Map();
    for (const erpV of variantList) {
      const match = findShopifyVariantMatch(
        erpV,
        shopifyVariants,
        usedShopifyIds,
        shopifyBySku,
        variantList.length,
        optionNames,
      );
      if (match) {
        usedShopifyIds.add(match.id);
        erpToShopify.set(erpV.id, match);
      }
    }

    const orphans = shopifyVariants.filter((sv) => !usedShopifyIds.has(sv.id));
    if (orphans.length > 0 && shopifyVariants.length - orphans.length >= 1) {
      for (const sv of orphans) {
        await client.delete(`/products/${externalId}/variants/${sv.id}.json`);
      }
      const { data: refreshed } = await client.get(`/products/${externalId}.json`);
      shopifyVariants = refreshed?.product?.variants || [];
    }

    const productChanged = !beforeProduct
      || erpFieldChanged(beforeProduct, product, "product_name")
      || erpFieldChanged(beforeProduct, product, "description")
      || erpFieldChanged(beforeProduct, product, "status");
    if (productChanged) {
      await client.put(`/products/${externalId}.json`, {
        product: {
          id: Number(externalId),
          title: product.product_name,
          body_html: product.description || undefined,
          status: product.status === "inactive" ? "draft" : "active",
        },
      });
    }

    const inventoryByErpVariantId = {};
    const beforeVariants = Array.isArray(beforeProduct?.variants) ? beforeProduct.variants : [];
    const beforeById = new Map(beforeVariants.map((v) => [Number(v.id), v]));

    for (const erpV of variantList) {
      const sku = String(erpV.sku || "").trim();
      const price = String(erpV.selling_price ?? 0);
      const compareAt = Number(erpV.cost_price) > 0 ? String(erpV.cost_price) : undefined;
      const skuKey = sku.toLowerCase();
      const shopifyV = erpToShopify.get(erpV.id);
      const variantPayload = shopifyVariantPayload(erpV, optionNames);
      const beforeV = beforeById.get(Number(erpV.id));

      if (shopifyV) {
        if (variantFieldsChanged(beforeV, erpV)) {
          await client.put(`/variants/${shopifyV.id}.json`, {
            variant: {
              id: shopifyV.id,
              price,
              compare_at_price: compareAt,
              sku: sku || shopifyV.sku,
              option1: variantPayload.option1,
              option2: variantPayload.option2,
              option3: variantPayload.option3,
              inventory_management: "shopify",
            },
          });
        }
        inventoryByErpVariantId[erpV.id] = shopifyV.inventory_item_id;
      } else if (erpV.id) {
        const { data: created } = await client.post(`/products/${externalId}/variants.json`, {
          variant: {
            price,
            compare_at_price: compareAt,
            sku: sku || undefined,
            ...variantPayload,
          },
        });
        const newV = created?.variant;
        if (newV?.id) {
          inventoryByErpVariantId[erpV.id] = newV.inventory_item_id;
          if (skuKey) shopifyBySku.set(skuKey, newV);
        }
      }
    }

    return { ok: true, inventoryByErpVariantId };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function pushInventoryLevel(store, { locationId, inventoryItemId, available, productExternalId = null }) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const locId = parseShopifyNumericId(locationId);
  const itemId = parseShopifyNumericId(inventoryItemId);
  if (!locId || !itemId) {
    return { ok: false, error: "Invalid Shopify location or inventory item id." };
  }
  const payload = {
    location_id: locId,
    inventory_item_id: itemId,
    available: Math.max(0, Math.floor(Number(available) || 0)),
  };

  const attemptSet = async () => {
    await client.post("/inventory_levels/set.json", payload);
    return { ok: true };
  };

  try {
    return await attemptSet();
  } catch (error) {
    let msg = formatShopifyError(error);
    if (inventoryNotTrackedMessage(msg)) {
      const enabled = await ensureVariantInventoryTracking(store, itemId);
      if (enabled) {
        try {
          return await attemptSet();
        } catch (retryErr) {
          msg = formatShopifyError(retryErr);
        }
      } else {
        msg = "This product variant does not track inventory in Shopify. Enable inventory tracking in Shopify admin.";
      }
    }
    if (/not stocked|not found|does not exist|404|inventory item/i.test(msg)) {
      try {
        await connectInventoryAtLocation(client, locId, itemId);
        return await attemptSet();
      } catch (connectError) {
        return { ok: false, error: formatShopifyError(connectError) };
      }
    }
    return { ok: false, error: msg };
  }
}

export async function pushInventoryLevelAdjust(store, { locationId, inventoryItemId, adjustment, productExternalId = null }) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const locId = parseShopifyNumericId(locationId);
  const itemId = parseShopifyNumericId(inventoryItemId);
  const delta = Math.floor(Number(adjustment) || 0);
  if (!locId || !itemId) {
    return { ok: false, error: "Invalid Shopify location or inventory item id." };
  }
  if (!delta) return { ok: true, skipped: true, reason: "zero_adjustment" };

  const payload = {
    location_id: locId,
    inventory_item_id: itemId,
    available_adjustment: delta,
  };

  const attemptAdjust = async () => {
    await client.post("/inventory_levels/adjust.json", payload);
    return { ok: true, adjustment: delta };
  };

  try {
    return await attemptAdjust();
  } catch (error) {
    let msg = formatShopifyError(error);
    if (inventoryNotTrackedMessage(msg)) {
      const enabled = await ensureVariantInventoryTracking(store, itemId);
      if (enabled) {
        try {
          return await attemptAdjust();
        } catch (retryErr) {
          msg = formatShopifyError(retryErr);
        }
      } else {
        msg = "This product variant does not track inventory in Shopify. Enable inventory tracking in Shopify admin.";
      }
    }
    if (/not stocked|not found|does not exist|404|inventory item/i.test(msg)) {
      try {
        await connectInventoryAtLocation(client, locId, itemId);
        return await attemptAdjust();
      } catch (connectError) {
        return { ok: false, error: formatShopifyError(connectError) };
      }
    }
    return { ok: false, error: msg };
  }
}

export async function pushOrderToShopify(store, externalId, order, { tenantId = null, skipLineItems = false, beforeOrder = null } = {}) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const shouldCancel = String(order.order_status || "").toLowerCase() === "cancelled";
  const warnings = [];

  try {
    const { data: existingData } = await client.get(`/orders/${externalId}.json`);
    const shopifyOrder = existingData?.order;
    const alreadyCancelled = Boolean(shopifyOrder?.cancelled_at);

    if (!alreadyCancelled) {
      try {
        await updateShopifyOrderDetails(client, externalId, order, { beforeOrder, shopifyOrder });
      } catch (err) {
        warnings.push(formatShopifyError(err));
      }

      if (tenantId && Array.isArray(order.items) && order.items.length && !skipLineItems) {
        try {
          await updateShopifyOrderLineItems(store, tenantId, externalId, order);
        } catch (err) {
          warnings.push(formatShopifyError(err));
        }
      }
    }

    if (shouldCancel && !alreadyCancelled) {
      await client.post(`/orders/${externalId}/cancel.json`, {});
      return { ok: true, action: "cancelled", warnings: warnings.length ? warnings : undefined };
    }

    if (!alreadyCancelled) {
      const orderStatus = String(order.order_status || "").toLowerCase();
      const fulfillmentStatus = String(order.fulfillment_status || "").toLowerCase();
      const paymentChanged = !beforeOrder
        || erpFieldChanged(beforeOrder, order, "payment_status");
      const statusChanged = !beforeOrder
        || erpFieldChanged(beforeOrder, order, "order_status")
        || erpFieldChanged(beforeOrder, order, "fulfillment_status");

      if (paymentChanged) {
        try {
          const payResult = await syncOrderPaymentToShopify(store, client, externalId, order, beforeOrder);
          if (payResult?.ok === false) {
            return {
              ok: false,
              error: payResult.error || "Could not mark the order as paid in Shopify.",
              warnings: warnings.length ? warnings : undefined,
            };
          }
        } catch (err) {
          return {
            ok: false,
            error: formatShopifyError(err),
            warnings: warnings.length ? warnings : undefined,
          };
        }
      }

      if (
        statusChanged
        && (["delivered", "shipped"].includes(orderStatus) || ["fulfilled", "partial"].includes(fulfillmentStatus))
      ) {
        try {
          const fulfillResult = await fulfillOrderInShopify(store, client, externalId, order);
          if (fulfillResult?.ok === false) {
            return {
              ok: false,
              error: fulfillResult.error || "Could not update fulfillment in Shopify.",
              warnings: warnings.length ? warnings : undefined,
            };
          }
          if (["fulfilled", "marked_delivered", "marked_shipped"].includes(fulfillResult.action)) {
            if (warnings.length) {
              return { ok: false, error: warnings.join("; "), action: fulfillResult.action, warnings };
            }
            return { ok: true, action: fulfillResult.action };
          }
        } catch (err) {
          return {
            ok: false,
            error: formatShopifyError(err),
            warnings: warnings.length ? warnings : undefined,
          };
        }
      }
      if (orderStatus === "returned" && (!beforeOrder || erpFieldChanged(beforeOrder, order, "order_status"))) {
        try {
          await appendShopifyOrderTags(client, externalId, ["erp-return"]);
        } catch (err) {
          warnings.push(formatShopifyError(err));
        }
      }
    }

    if (warnings.length) {
      return { ok: false, error: warnings.join("; "), action: "partial", warnings };
    }
    return { ok: true, action: "updated" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

function buildShopifyAddress(order) {
  if (!order.delivery_address && !order.city) return null;
  return {
    address1: order.delivery_address || undefined,
    city: order.city || undefined,
    province: order.delivery_state || order.state || order.province || undefined,
    zip: order.delivery_postal_code || order.postal_code || order.zip || undefined,
    country: order.delivery_country || order.country || undefined,
    phone: toShopifyPhone(order.customer_phone || order.phone),
    name: order.customer_name || undefined,
  };
}

function shopifyAddressField(addr, key) {
  const map = {
    delivery_address: "address1",
    city: "city",
    delivery_state: "province",
    delivery_postal_code: "zip",
    delivery_country: "country",
    customer_phone: "phone",
    customer_name: "name",
  };
  return normalizeStr(addr?.[map[key] || key]);
}

function orderAddressChangedAgainst(beforeOrder, order, shopifyOrder) {
  const addressFields = [
    "delivery_address",
    "city",
    "delivery_state",
    "delivery_postal_code",
    "delivery_country",
    "customer_phone",
    "customer_name",
  ];
  if (beforeOrder) {
    return addressFields.some((field) => erpFieldChanged(beforeOrder, order, field));
  }
  const shopAddr = shopifyOrder?.shipping_address || shopifyOrder?.billing_address || {};
  return addressFields.some((field) => normalizeStr(order[field]) !== shopifyAddressField(shopAddr, field));
}

function orderFieldNeedsPush(beforeOrder, order, shopifyOrder, erpKey, shopifyKey = erpKey) {
  if (beforeOrder) return erpFieldChanged(beforeOrder, order, erpKey);
  const erpVal = erpKey === "notes"
    ? normalizeStr(order.notes)
    : erpKey === "customer_email"
      ? normalizeStr(order.customer_email)
      : normalizeStr(order[erpKey]);
  const shopVal = shopifyKey === "note"
    ? normalizeStr(shopifyOrder?.note)
    : shopifyKey === "email"
      ? normalizeStr(shopifyOrder?.email)
      : shopifyKey === "tags"
        ? normalizeTagsValue(shopifyOrder?.tags)
        : normalizeStr(shopifyOrder?.[shopifyKey]);
  return erpVal !== shopVal;
}

async function updateShopifyOrderDetails(client, externalId, order, { beforeOrder = null, shopifyOrder = null } = {}) {
  const orderPayload = { id: Number(externalId) };
  let hasChanges = false;

  if (orderFieldNeedsPush(beforeOrder, order, shopifyOrder, "notes", "note")) {
    orderPayload.note = order.notes || "";
    hasChanges = true;
  }
  if (orderFieldNeedsPush(beforeOrder, order, shopifyOrder, "customer_email", "email")) {
    orderPayload.email = order.customer_email || "";
    hasChanges = true;
  }
  if (beforeOrder ? tagsChanged(beforeOrder, order) : normalizeTagsValue(order.tags) !== normalizeTagsValue(shopifyOrder?.tags)) {
    orderPayload.tags = order.tags || "";
    hasChanges = true;
  }

  if (orderAddressChangedAgainst(beforeOrder, order, shopifyOrder)) {
    const address = buildShopifyAddress(order);
    if (address) {
      orderPayload.shipping_address = address;
      orderPayload.billing_address = address;
      hasChanges = true;
    }
  }

  if (!hasChanges) return false;
  await client.put(`/orders/${externalId}.json`, { order: orderPayload });
  return true;
}

async function appendShopifyOrderTags(client, externalId, newTags = []) {
  const tags = (Array.isArray(newTags) ? newTags : []).map((t) => String(t).trim()).filter(Boolean);
  if (!tags.length) return;
  const { data } = await client.get(`/orders/${externalId}.json`);
  const existing = String(data?.order?.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const merged = [...new Set([...existing, ...tags])].join(", ");
  await client.put(`/orders/${externalId}.json`, {
    order: { id: Number(externalId), tags: merged },
  });
}

async function markFulfillmentShipmentStatus(store, client, externalId, orderStatus) {
  const targetRest = orderStatus === "delivered" ? "delivered" : "in_transit";
  const targetGql = orderStatus === "delivered" ? "DELIVERED" : "IN_TRANSIT";
  const { data } = await client.get(`/orders/${externalId}/fulfillments.json`);
  const fulfillments = (data?.fulfillments || []).filter(
    (f) => String(f.status || "").toLowerCase() === "success",
  );
  if (!fulfillments.length) return false;

  let anyUpdated = false;
  let lastError = null;
  const gql = shopifyGraphqlClient({ storeUrl: store.store_url, accessToken: store.access_token });

  for (const fulfillment of fulfillments) {
    const current = String(fulfillment.shipment_status || "").toLowerCase();
    if (orderStatus === "delivered" && current === "delivered") {
      anyUpdated = true;
      continue;
    }
    if (orderStatus === "shipped" && ["in_transit", "out_for_delivery", "delivered"].includes(current)) {
      anyUpdated = true;
      continue;
    }

    // Preferred: GraphQL fulfillmentEventCreate (what Admin "Mark as delivered" uses).
    try {
      const { data: gqlData } = await gql.post("", {
        query: `mutation fulfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!) {
          fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
            fulfillmentEvent { id status }
            userErrors { field message }
          }
        }`,
        variables: {
          fulfillmentEvent: {
            fulfillmentId: `gid://shopify/Fulfillment/${fulfillment.id}`,
            status: targetGql,
            happenedAt: new Date().toISOString(),
          },
        },
      });
      if (gqlData?.errors?.length) {
        throw new Error(gqlData.errors.map((e) => e.message).filter(Boolean).join("; "));
      }
      const payload = gqlData?.data?.fulfillmentEventCreate;
      const userErrors = payload?.userErrors || [];
      if (userErrors.length) {
        throw new Error(userErrors.map((e) => e.message).filter(Boolean).join("; "));
      }
      if (payload?.fulfillmentEvent) {
        anyUpdated = true;
        continue;
      }
    } catch (gqlError) {
      lastError = gqlError?.response?.data
        ? formatShopifyError(gqlError)
        : (gqlError.message || "fulfillmentEventCreate failed");
    }

    // REST fallback
    try {
      await client.post(`/orders/${externalId}/fulfillments/${fulfillment.id}/events.json`, {
        event: { status: targetRest },
      });
      anyUpdated = true;
    } catch (restError) {
      lastError = formatShopifyError(restError) || lastError;
    }
  }

  if (!anyUpdated && lastError) {
    throw new Error(lastError);
  }
  return anyUpdated;
}

async function fulfillOrderInShopify(store, client, externalId, order) {
  const orderStatus = String(order.order_status || "").toLowerCase();
  const { data } = await client.get(`/orders/${externalId}/fulfillment_orders.json`);
  const fulfillmentOrders = data?.fulfillment_orders || [];
  const openOrders = fulfillmentOrders.filter((fo) =>
    ["open", "in_progress"].includes(String(fo.status || "").toLowerCase()),
  );

  if (openOrders.length) {
    await client.post("/fulfillments.json", {
      fulfillment: {
        notify_customer: false,
        line_items_by_fulfillment_order: openOrders.map((fo) => ({
          fulfillment_order_id: fo.id,
        })),
      },
    });
    if (orderStatus === "delivered") {
      await markFulfillmentShipmentStatus(store, client, externalId, "delivered");
      return { ok: true, action: "marked_delivered" };
    }
    if (orderStatus === "shipped") {
      try {
        await markFulfillmentShipmentStatus(store, client, externalId, "shipped");
      } catch {
        // in_transit event is best-effort after fulfill
      }
    }
    return { ok: true, action: "fulfilled" };
  }

  if (["delivered", "shipped"].includes(orderStatus)) {
    const updated = await markFulfillmentShipmentStatus(store, client, externalId, orderStatus);
    if (updated) {
      return { ok: true, action: orderStatus === "delivered" ? "marked_delivered" : "marked_shipped" };
    }
    if (orderStatus === "delivered") {
      return { ok: false, error: "Could not mark the Shopify fulfillment as delivered." };
    }
  }

  return { ok: true, action: "already_fulfilled" };
}

async function shopifyOrderOutstandingBalance(client, externalId, order) {
  const { data } = await client.get(`/orders/${externalId}.json`);
  const shopifyOrder = data?.order;
  if (!shopifyOrder) return { outstanding: 0, financial: null, total: 0 };

  const financial = String(shopifyOrder.financial_status || "").toLowerCase();
  const total = parseFloat(shopifyOrder.total_price || 0) || Number(order.payable_amount) || 0;

  let transactions = shopifyOrder.transactions || [];
  if (!transactions.length) {
    try {
      const { data: txData } = await client.get(`/orders/${externalId}/transactions.json`);
      transactions = txData?.transactions || [];
    } catch {
      transactions = [];
    }
  }

  const received = transactions
    .filter((tx) => {
      const kind = String(tx.kind || "").toLowerCase();
      const status = String(tx.status || "").toLowerCase();
      return ["sale", "capture"].includes(kind) && status === "success";
    })
    .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

  const refunded = transactions
    .filter((tx) => String(tx.kind || "").toLowerCase() === "refund" && String(tx.status || "").toLowerCase() === "success")
    .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);

  const outstanding = Math.max(0, Math.round((total - received + refunded) * 100) / 100);
  return { outstanding, financial, total };
}

/**
 * When ERP marks an order paid/partial, create a Shopify sale transaction for the outstanding balance.
 * Without this, webhooks re-import unpaid and wipe the ERP payment_status.
 */
async function syncOrderPaymentToShopify(store, client, externalId, order, beforeOrder) {
  const after = String(order.payment_status || "").toLowerCase();
  const before = String(beforeOrder?.payment_status || "").toLowerCase();
  if (!["paid", "partial"].includes(after)) {
    return { ok: true, skipped: true, reason: "not_paid_status" };
  }
  if (beforeOrder && before === after && ["paid", "partial", "partially_paid"].includes(before)) {
    return { ok: true, skipped: true, reason: "unchanged" };
  }

  const { outstanding, financial } = await shopifyOrderOutstandingBalance(client, externalId, order);
  if (financial === "paid" && after === "paid") {
    return { ok: true, action: "already_paid" };
  }
  if (outstanding <= 0) {
    return { ok: true, action: "already_paid" };
  }

  // Partial: if already partially paid on Shopify and ERP only flipped to partial, skip.
  // When moving unpaid → paid/partial, capture the outstanding (full remaining for paid).
  let amount = outstanding;
  if (after === "partial" && before === "unpaid") {
    // Capture remaining as partial marker; Shopify will show partially_paid if amount < total.
    // Prefer half of outstanding only when we have no better signal — use full outstanding
    // rounded so a single "mark partial" without amount still records something meaningful.
    // Better: use ERP payable if smaller.
    const payable = Number(order.payable_amount);
    if (Number.isFinite(payable) && payable > 0 && payable < outstanding) {
      amount = payable;
    }
  }

  return recordPaymentInShopify(store, externalId, {
    amount,
    paymentMethod: "manual",
    markFullyPaid: after === "paid",
  });
}

export async function cancelOrderInShopify(store, externalId) {
  const orderId = parseShopifyNumericId(externalId);
  if (!orderId) return { ok: false, error: "Invalid Shopify order id" };

  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.get(`/orders/${orderId}.json`);
    const shopifyOrder = data?.order;
    if (!shopifyOrder) return { ok: false, error: "Shopify order not found" };
    if (shopifyOrder.cancelled_at) {
      return { ok: true, action: "already_cancelled" };
    }

    // Fulfilled orders cannot be cancelled until fulfillments are cancelled first.
    try {
      const { data: fulData } = await client.get(`/orders/${orderId}/fulfillments.json`);
      const fulfillments = (fulData?.fulfillments || []).filter((f) =>
        ["success", "open", "pending"].includes(String(f.status || "").toLowerCase()),
      );
      for (const fulfillment of fulfillments) {
        try {
          await client.post(`/fulfillments/${fulfillment.id}/cancel.json`, {});
        } catch {
          // Continue — GraphQL cancel may still succeed for some states.
        }
      }
    } catch {
      // Fulfillment list optional for unfulfilled orders.
    }

    // Preferred: GraphQL orderCancel (supports paid/fulfilled after fulfillment cancel).
    try {
      const gql = shopifyGraphqlClient({ storeUrl: store.store_url, accessToken: store.access_token });
      const { data: gqlData } = await gql.post("", {
        query: `mutation OrderCancel(
          $orderId: ID!,
          $refundMethod: OrderCancelRefundMethodInput!,
          $restock: Boolean!,
          $reason: OrderCancelReason!,
          $notifyCustomer: Boolean
        ) {
          orderCancel(
            orderId: $orderId,
            refundMethod: $refundMethod,
            restock: $restock,
            reason: $reason,
            notifyCustomer: $notifyCustomer
          ) {
            job { id done }
            orderCancelUserErrors { field message code }
            userErrors { field message }
          }
        }`,
        variables: {
          orderId: `gid://shopify/Order/${orderId}`,
          refundMethod: { originalPaymentMethodsRefund: false },
          restock: true,
          reason: "OTHER",
          notifyCustomer: false,
        },
      });

      if (gqlData?.errors?.length) {
        throw new Error(gqlData.errors.map((e) => e.message).filter(Boolean).join("; "));
      }

      const payload = gqlData?.data?.orderCancel;
      const userErrors = [
        ...(payload?.orderCancelUserErrors || []),
        ...(payload?.userErrors || []),
      ];
      if (userErrors.length) {
        // Retry without restock (paid + fulfilled edge cases).
        const { data: retryData } = await gql.post("", {
          query: `mutation OrderCancel(
            $orderId: ID!,
            $refundMethod: OrderCancelRefundMethodInput!,
            $restock: Boolean!,
            $reason: OrderCancelReason!,
            $notifyCustomer: Boolean
          ) {
            orderCancel(
              orderId: $orderId,
              refundMethod: $refundMethod,
              restock: $restock,
              reason: $reason,
              notifyCustomer: $notifyCustomer
            ) {
              job { id done }
              orderCancelUserErrors { field message code }
              userErrors { field message }
            }
          }`,
          variables: {
            orderId: `gid://shopify/Order/${orderId}`,
            refundMethod: { originalPaymentMethodsRefund: false },
            restock: false,
            reason: "OTHER",
            notifyCustomer: false,
          },
        });
        const retryPayload = retryData?.data?.orderCancel;
        const retryErrors = [
          ...(retryPayload?.orderCancelUserErrors || []),
          ...(retryPayload?.userErrors || []),
        ];
        if (!retryErrors.length && (retryPayload?.job || retryPayload)) {
          return { ok: true, action: "cancelled" };
        }
        const msg = (retryErrors.length ? retryErrors : userErrors)
          .map((e) => e.message)
          .filter(Boolean)
          .join("; ");
        throw new Error(msg || "Shopify rejected the order cancellation");
      }
      return { ok: true, action: "cancelled" };
    } catch (gqlError) {
      // REST fallback for simpler unpaid/unfulfilled orders.
      try {
        await client.post(`/orders/${orderId}/cancel.json`, {
          reason: "other",
          email: false,
          restock: true,
        });
        return { ok: true, action: "cancelled" };
      } catch (restError) {
        return {
          ok: false,
          error:
            formatShopifyError(restError)
            || (gqlError?.response?.data ? formatShopifyError(gqlError) : gqlError.message)
            || "Could not cancel the order in Shopify",
        };
      }
    }
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

/**
 * Phase 1 of deferred order delete: cancel on Shopify and append ERP deletion note.
 * Hard DELETE of the Shopify order happens later via the pending-deletes job.
 */
export async function markOrderPendingDeleteInShopify(store, externalId, noteLine) {
  const cancel = await cancelOrderInShopify(store, externalId);
  if (!cancel.ok) return cancel;

  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await appendShopifyOrderTags(client, externalId, ["erp-pending-delete"]);
    const { data } = await client.get(`/orders/${externalId}.json`);
    const existingNote = String(data?.order?.note || "").trim();
    const note = existingNote ? `${existingNote}\n${noteLine}` : noteLine;
    await client.put(`/orders/${externalId}.json`, {
      order: { id: Number(externalId), note },
    });
    return {
      ok: true,
      action: cancel.action === "already_cancelled" ? "already_cancelled_noted" : "cancelled_pending_delete",
      shopifyNote: noteLine,
    };
  } catch (error) {
    // Cancel already succeeded — still schedule hard delete, but report note failure clearly.
    return {
      ok: true,
      action: "cancelled_note_failed",
      shopifyNote: noteLine,
      warning: formatShopifyError(error),
    };
  }
}

export async function deleteOrderFromShopify(store, externalId) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await client.delete(`/orders/${externalId}.json`);
    return { ok: true, action: "deleted" };
  } catch (error) {
    const msg = formatShopifyError(error);
    if (/not found|404|does not exist/i.test(msg)) {
      return { ok: true, action: "already_deleted" };
    }
    return { ok: false, error: msg };
  }
}

export async function deleteProductFromShopify(store, externalId) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await client.delete(`/products/${externalId}.json`);
    return { ok: true, action: "deleted" };
  } catch (error) {
    const msg = formatShopifyError(error);
    if (/not found|404|does not exist/i.test(msg)) {
      return { ok: true, action: "already_deleted" };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Phase 1 of deferred product delete: set Shopify product to draft and tag it.
 * Hard DELETE happens later via the pending-deletes job.
 */
export async function markProductPendingDeleteInShopify(store, externalId, noteLine) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.get(`/products/${externalId}.json`);
    const product = data?.product;
    if (!product) return { ok: false, error: "Shopify product not found" };

    const existingTags = String(product.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = [...new Set([...existingTags, "erp-pending-delete"])].join(", ");
    const bodyHtml = String(product.body_html || "");
    const stamped = bodyHtml.includes("[ERP] This product was deleted from the ERP")
      ? bodyHtml
      : `${bodyHtml}<p><em>${noteLine}</em></p>`;

    await client.put(`/products/${externalId}.json`, {
      product: {
        id: Number(externalId),
        status: "draft",
        tags,
        body_html: stamped,
      },
    });
    return { ok: true, action: "drafted_pending_delete", shopifyNote: noteLine };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function deactivateLocationInShopify(store, externalId) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await client.put(`/locations/${externalId}.json`, {
      location: { id: Number(externalId), active: false },
    });
    return { ok: true, action: "deactivated" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

/**
 * Mark an existing Shopify order as paid.
 * `kind: sale` is rejected on existing orders — use orderMarkAsPaid (GraphQL)
 * or capture against a pending/authorization parent transaction (REST).
 */
export async function recordPaymentInShopify(
  store,
  externalId,
  { amount, paymentMethod: _paymentMethod = "manual", markFullyPaid = true } = {},
) {
  const orderId = parseShopifyNumericId(externalId);
  if (!orderId) {
    return { ok: false, error: "Invalid Shopify order id" };
  }

  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  let lastError = null;

  if (markFullyPaid) {
    try {
      const gql = shopifyGraphqlClient({ storeUrl: store.store_url, accessToken: store.access_token });
      const { data } = await gql.post("", {
        query: `mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
          orderMarkAsPaid(input: $input) {
            order { id displayFinancialStatus }
            userErrors { field message }
          }
        }`,
        variables: { input: { id: `gid://shopify/Order/${orderId}` } },
      });

      if (data?.errors?.length) {
        throw new Error(data.errors.map((e) => e.message).filter(Boolean).join("; ") || "GraphQL error");
      }

      const payload = data?.data?.orderMarkAsPaid;
      const userErrors = payload?.userErrors || [];
      const financial = String(payload?.order?.displayFinancialStatus || "").toUpperCase();

      if (!userErrors.length && payload?.order) {
        return { ok: true, action: "marked_paid" };
      }

      const msg = userErrors.map((e) => e.message).filter(Boolean).join("; ");
      if (financial === "PAID" || /already\s+paid/i.test(msg)) {
        return { ok: true, action: "already_paid" };
      }
      lastError = msg || "Could not mark order as paid in Shopify";
    } catch (gqlError) {
      lastError = gqlError?.response?.data
        ? formatShopifyError(gqlError)
        : (gqlError.message || "orderMarkAsPaid failed");
    }
  }

  try {
    const restResult = await captureShopifyOrderPayment(client, orderId, amount);
    if (restResult.ok) return restResult;
    return { ok: false, error: restResult.error || lastError || "Could not record payment in Shopify" };
  } catch (restError) {
    return {
      ok: false,
      error: formatShopifyError(restError) || lastError || "Could not record payment in Shopify",
    };
  }
}

async function captureShopifyOrderPayment(client, orderId, amount) {
  const { data: txData } = await client.get(`/orders/${orderId}/transactions.json`);
  const transactions = txData?.transactions || [];

  const { data: orderData } = await client.get(`/orders/${orderId}.json`);
  const financial = String(orderData?.order?.financial_status || "").toLowerCase();
  if (financial === "paid") {
    return { ok: true, action: "already_paid" };
  }

  const parent =
    transactions.find((tx) => {
      const kind = String(tx.kind || "").toLowerCase();
      const status = String(tx.status || "").toLowerCase();
      return kind === "authorization" && ["success", "pending"].includes(status);
    })
    || transactions.find((tx) => String(tx.status || "").toLowerCase() === "pending")
    || null;

  const amt = Number(amount);
  const payload = {
    transaction: {
      kind: "capture",
      ...(parent?.id ? { parent_id: parent.id } : {}),
      ...(Number.isFinite(amt) && amt > 0 ? { amount: amt.toFixed(2) } : {}),
    },
  };

  await client.post(`/orders/${orderId}/transactions.json`, payload);
  return { ok: true, action: "payment_captured" };
}

export async function createRefundInShopify(store, externalId, { amount, reason }) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: false, error: "Invalid refund amount" };
  }
  try {
    const { data: orderData } = await client.get(`/orders/${externalId}.json`);
    const order = orderData?.order;
    const parentTx = (order?.transactions || []).find(
      (tx) => ["sale", "capture"].includes(String(tx.kind || "").toLowerCase())
        && String(tx.status || "").toLowerCase() === "success",
    );
    if (!parentTx) {
      return { ok: false, error: "No successful Shopify payment transaction found to refund against." };
    }
    await client.post(`/orders/${externalId}/refunds.json`, {
      refund: {
        note: reason || "Refund from ERP",
        notify: false,
        shipping: { full_refund: false },
        transactions: [
          {
            parent_id: parentTx.id,
            amount: amt.toFixed(2),
            kind: "refund",
            gateway: parentTx.gateway || "manual",
          },
        ],
      },
    });
    return { ok: true, action: "refunded" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function pushReturnNoteToShopify(store, externalId, { reason, returnStatus }) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await appendShopifyOrderTags(client, externalId, [`erp-return-${returnStatus || "requested"}`]);
    const { data } = await client.get(`/orders/${externalId}.json`);
    const existingNote = String(data?.order?.note || "").trim();
    const line = `[ERP Return ${returnStatus || "requested"}] ${reason || ""}`.trim();
    const note = existingNote ? `${existingNote}\n${line}` : line;
    await client.put(`/orders/${externalId}.json`, {
      order: { id: Number(externalId), note },
    });
    return { ok: true, action: "return_noted" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function pushExchangeNoteToShopify(store, externalId, { reason, exchangeStatus, oldProductId, newProductId }) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    await appendShopifyOrderTags(client, externalId, [`erp-exchange-${exchangeStatus || "requested"}`]);
    const { data } = await client.get(`/orders/${externalId}.json`);
    const existingNote = String(data?.order?.note || "").trim();
    const line = `[ERP Exchange ${exchangeStatus || "requested"}] product ${oldProductId} → ${newProductId}. ${reason || ""}`.trim();
    const note = existingNote ? `${existingNote}\n${line}` : line;
    await client.put(`/orders/${externalId}.json`, {
      order: { id: Number(externalId), note },
    });
    return { ok: true, action: "exchange_noted" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

function shopifyGid(resource, legacyId) {
  return `gid://shopify/${resource}/${legacyId}`;
}

async function shopifyGraphql(store, query, variables = {}) {
  const gql = shopifyGraphqlClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const { data } = await gql.post("", { query, variables });
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }
  return data.data;
}

function assertNoUserErrors(payload, mutationName) {
  const errors = payload?.[mutationName]?.userErrors;
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}

function normalizeSkuKey(sku) {
  return String(sku || "").trim().toLowerCase();
}

async function findErpVariantBySku(tenantId, sku) {
  const trimmed = String(sku || "").trim();
  if (!trimmed || trimmed === "—") return null;
  const loose = await inventoryRepository.findVariantBySkuLoose(tenantId, trimmed);
  if (loose) return loose;
  if (/^\d+$/.test(trimmed)) {
    return inventoryRepository.findVariantBySkuLoose(tenantId, `shopify:${trimmed}`);
  }
  return null;
}

async function resolveVariantFromLinkedProduct(store, tenantId, productId, sku) {
  const link = await getEntityLinkByInternalId(tenantId, "product", productId, "shopify");
  if (!link) return null;
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.get(`/products/${link.external_id}.json`);
    const variants = data?.product?.variants || [];
    const skuKey = normalizeSkuKey(sku);
    if (skuKey) {
      const match = variants.find((v) => normalizeSkuKey(v.sku) === skuKey);
      if (match?.id) return String(match.id);
      // Imported orders may store Shopify variant id as the line sku.
      const byVariantId = variants.find((v) => String(v.id) === skuKey);
      if (byVariantId?.id) return String(byVariantId.id);
    }
    if (variants.length === 1 && variants[0]?.id) return String(variants[0].id);
  } catch {
    return null;
  }
  return null;
}

async function resolveVariantFromShopifyOrderLines(store, orderExternalId, sku, productName) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.get(`/orders/${orderExternalId}.json`);
    const lineItems = data?.order?.line_items || [];
    const skuKey = normalizeSkuKey(sku);
    const nameKey = String(productName || "").trim().toLowerCase();

    for (const line of lineItems) {
      const variantLegacy = line.variant_id != null ? String(line.variant_id) : null;
      if (!variantLegacy) continue;
      const lineSku = normalizeSkuKey(line.sku);
      if (skuKey && (lineSku === skuKey || variantLegacy === skuKey)) {
        return variantLegacy;
      }
      const lineName = String(line.name || line.title || "").trim().toLowerCase();
      if (nameKey && lineName && lineName === nameKey) {
        return variantLegacy;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Resolve a Shopify variant legacy id for an ERP order line item. */
export async function resolveShopifyVariantIdForItem(
  store,
  tenantId,
  productId,
  sku,
  { orderExternalId = null, productName = null } = {},
) {
  let resolvedProductId = productId ? Number(productId) : null;
  if (!resolvedProductId) {
    const erpVariant = await findErpVariantBySku(tenantId, sku);
    resolvedProductId = erpVariant?.product_id || null;
  }

  if (resolvedProductId) {
    const fromProduct = await resolveVariantFromLinkedProduct(store, tenantId, resolvedProductId, sku);
    if (fromProduct) return fromProduct;
  }

  if (orderExternalId) {
    const fromOrder = await resolveVariantFromShopifyOrderLines(store, orderExternalId, sku, productName);
    if (fromOrder) return fromOrder;
  }

  return null;
}

const ORDER_EDIT_BEGIN = `
  mutation orderEditBegin($id: ID!) {
    orderEditBegin(id: $id) {
      calculatedOrder {
        id
        lineItems(first: 100) {
          edges {
            node {
              id
              quantity
              editableQuantity
              variant { legacyResourceId }
            }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_SET_QUANTITY = `
  mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
    orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
      calculatedOrder { id }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_ADD_VARIANT = `
  mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
    orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity, allowDuplicates: true) {
      calculatedOrder { id }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_COMMIT = `
  mutation orderEditCommit($id: ID!) {
    orderEditCommit(id: $id, notifyCustomer: false, staffNote: "Updated from ERP") {
      order { id }
      userErrors { field message }
    }
  }
`;

function isUneditableLineItemError(message) {
  return /removed|fulfilled|selling plan|tip/i.test(String(message || ""));
}

async function safeOrderEditSetQuantity(store, calculatedId, lineItemId, quantity, { restock = false } = {}) {
  const setData = await shopifyGraphql(store, ORDER_EDIT_SET_QUANTITY, {
    id: calculatedId,
    lineItemId,
    quantity,
    restock,
  });
  const errs = setData.orderEditSetQuantity?.userErrors || [];
  if (!errs.length) return { ok: true };
  const msg = errs.map((e) => e.message).join("; ");
  if (isUneditableLineItemError(msg)) return { ok: false, error: msg };
  assertNoUserErrors(setData, "orderEditSetQuantity");
  return { ok: true };
}

async function safeOrderEditAddVariant(store, calculatedId, variantLegacy, quantity) {
  const addData = await shopifyGraphql(store, ORDER_EDIT_ADD_VARIANT, {
    id: calculatedId,
    variantId: shopifyGid("ProductVariant", variantLegacy),
    quantity,
  });
  const errs = addData.orderEditAddVariant?.userErrors || [];
  if (!errs.length) return { ok: true };
  const msg = errs.map((e) => e.message).join("; ");
  return { ok: false, error: msg };
}

async function updateShopifyOrderLineItems(store, tenantId, externalId, order) {
  const desired = new Map();
  const unmatched = [];
  for (const item of order.items || []) {
    const variantId = await resolveShopifyVariantIdForItem(
      store,
      tenantId,
      item.product_id,
      item.sku,
      { orderExternalId: externalId, productName: item.product_name },
    );
    if (!variantId) {
      unmatched.push(item.sku || item.product_name || "unknown item");
      continue;
    }
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    desired.set(variantId, (desired.get(variantId) || 0) + qty);
  }
  if (!desired.size) {
    const hint = unmatched.length
      ? ` Unmatched: ${unmatched.join(", ")}. Link products to Shopify or ensure SKUs match.`
      : "";
    throw new Error(`No order lines could be matched to Shopify products.${hint}`);
  }

  const beginData = await shopifyGraphql(store, ORDER_EDIT_BEGIN, {
    id: shopifyGid("Order", externalId),
  });
  assertNoUserErrors(beginData, "orderEditBegin");
  const calculated = beginData.orderEditBegin?.calculatedOrder;
  if (!calculated?.id) throw new Error("Shopify order edit could not be started.");

  const calculatedId = calculated.id;
  const lineNodes = (calculated.lineItems?.edges || []).map((edge) => edge.node);
  const currentActiveQty = new Map();
  const editableLinesByVariant = new Map();

  for (const line of lineNodes) {
    const variantLegacy = line.variant?.legacyResourceId != null ? String(line.variant.legacyResourceId) : null;
    if (!variantLegacy) continue;
    const qty = Number(line.quantity) || 0;
    const editable = Number(line.editableQuantity ?? 0) || 0;
    if (qty > 0) {
      currentActiveQty.set(variantLegacy, (currentActiveQty.get(variantLegacy) || 0) + qty);
    }
    if (qty > 0 && editable > 0) {
      const lines = editableLinesByVariant.get(variantLegacy) || [];
      lines.push(line);
      editableLinesByVariant.set(variantLegacy, lines);
    }
  }

  const warnings = [];

  // Remove lines that ERP deleted (only when Shopify still allows editing them).
  for (const line of lineNodes) {
    const variantLegacy = line.variant?.legacyResourceId != null ? String(line.variant.legacyResourceId) : null;
    if (!variantLegacy || desired.has(variantLegacy)) continue;
    const qty = Number(line.quantity) || 0;
    const editable = Number(line.editableQuantity ?? 0) || 0;
    if (qty <= 0 || editable <= 0) continue;
    const result = await safeOrderEditSetQuantity(store, calculatedId, line.id, 0, { restock: true });
    if (result.ok) {
      currentActiveQty.set(variantLegacy, 0);
    } else if (result.error) {
      warnings.push(result.error);
    }
  }

  for (const [variantLegacy, targetQty] of desired.entries()) {
    let currentQty = currentActiveQty.get(variantLegacy) || 0;
    const delta = targetQty - currentQty;
    if (delta === 0) continue;

    if (delta < 0) {
      let toRemove = -delta;
      const editableLines = editableLinesByVariant.get(variantLegacy) || [];
      for (const line of editableLines) {
        if (toRemove <= 0) break;
        const lineQty = Number(line.quantity) || 0;
        const newQty = Math.max(0, lineQty - toRemove);
        const removed = lineQty - newQty;
        toRemove -= removed;
        if (newQty === lineQty) continue;
        const result = await safeOrderEditSetQuantity(store, calculatedId, line.id, newQty, { restock: true });
        if (!result.ok) {
          warnings.push(result.error || `Could not reduce quantity for variant ${variantLegacy}.`);
          break;
        }
        currentQty -= removed;
      }
      if (toRemove > 0) {
        warnings.push(`Could not reduce ${toRemove} unit(s) for variant ${variantLegacy} because those units are fulfilled.`);
      }
      currentActiveQty.set(variantLegacy, currentQty);
      continue;
    }

    // Increase quantity: prefer editing an unfulfilled line; otherwise add a new line (works on fulfilled orders).
    const editableLines = editableLinesByVariant.get(variantLegacy) || [];
    const primaryEditable = editableLines[0];
    if (primaryEditable) {
      const result = await safeOrderEditSetQuantity(store, calculatedId, primaryEditable.id, targetQty);
      if (result.ok) {
        currentActiveQty.set(variantLegacy, targetQty);
        continue;
      }
      if (result.error) warnings.push(result.error);
    }

    const addQty = targetQty - (currentActiveQty.get(variantLegacy) || 0);
    if (addQty > 0) {
      const addResult = await safeOrderEditAddVariant(store, calculatedId, variantLegacy, addQty);
      if (addResult.ok) {
        currentActiveQty.set(variantLegacy, (currentActiveQty.get(variantLegacy) || 0) + addQty);
      } else {
        throw new Error(addResult.error || `Could not add ${addQty} unit(s) for variant ${variantLegacy}.`);
      }
    }
  }

  const commitData = await shopifyGraphql(store, ORDER_EDIT_COMMIT, { id: calculatedId });
  assertNoUserErrors(commitData, "orderEditCommit");

  if (warnings.length) {
    throw new Error(warnings.join("; "));
  }
}

function buildShopifyProductOptions(erpVariants) {
  const optionNames = [];
  const valueSets = [];
  for (const variant of erpVariants) {
    for (const attr of variant.attributes || []) {
      const name = String(attr.attribute_name || "").trim();
      const value = String(attr.value || "").trim();
      if (!name || !value) continue;
      let idx = optionNames.indexOf(name);
      if (idx === -1) {
        optionNames.push(name);
        valueSets.push(new Set());
        idx = optionNames.length - 1;
      }
      valueSets[idx].add(value);
    }
  }
  if (!optionNames.length) return { options: undefined, variants: erpVariants };
  return {
    options: optionNames.map((name, i) => ({ name, values: [...valueSets[i]] })),
    variants: erpVariants,
  };
}

function shopifyVariantPayload(erpVariant, optionNames = null) {
  const cost = Number(erpVariant.cost_price);
  const compareAt =
    !Number.isNaN(cost) && cost > 0 ? String(cost) : undefined;
  const attrs = (erpVariant.attributes || []).filter((a) => a?.attribute_name && a?.value);
  if (attrs.length) {
    let option1;
    let option2;
    let option3;
    if (Array.isArray(optionNames) && optionNames.length) {
      const byName = new Map(
        attrs.map((a) => [String(a.attribute_name).trim().toLowerCase(), String(a.value).trim()]),
      );
      const ordered = optionNames
        .map((name) => byName.get(String(name).trim().toLowerCase()))
        .filter(Boolean);
      [option1, option2, option3] = ordered;
    } else {
      [option1, option2, option3] = attrs.map((a) => String(a.value).trim());
    }
    return {
      option1: option1 || erpVariant.variant_name || "Default Title",
      option2: option2 || undefined,
      option3: option3 || undefined,
      price: String(erpVariant.selling_price ?? 0),
      compare_at_price: compareAt,
      sku: erpVariant.sku || undefined,
      inventory_management: "shopify",
    };
  }
  return {
    option1: erpVariant.variant_name || erpVariant.sku || "Default Title",
    price: String(erpVariant.selling_price ?? 0),
    compare_at_price: compareAt,
    sku: erpVariant.sku || undefined,
    inventory_management: "shopify",
  };
}

function customerTags(customer) {
  if (!Array.isArray(customer.tags)) return undefined;
  const tags = customer.tags.map((t) => (typeof t === "string" ? t : t?.tag_name)).filter(Boolean);
  return tags.join(", ");
}

/**
 * Find an existing Shopify customer by email or phone so we don't create duplicates.
 */
export async function findShopifyCustomerByContact(store, { email, phone } = {}) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const emailQ = String(email || "").trim().toLowerCase();
  const phoneE164 = toShopifyPhone(phone);
  const queries = [];
  if (emailQ) queries.push(`email:${emailQ}`);
  if (phoneE164) queries.push(`phone:${phoneE164}`);

  for (const query of queries) {
    try {
      const { data } = await client.get("/customers/search.json", {
        params: { query, limit: 5 },
      });
      const customers = data?.customers || [];
      if (!customers.length) continue;

      if (emailQ) {
        const byEmail = customers.find(
          (c) => String(c.email || "").trim().toLowerCase() === emailQ,
        );
        if (byEmail?.id) return String(byEmail.id);
      }
      if (phoneE164) {
        const want = phoneE164.replace(/\D/g, "");
        const byPhone = customers.find((c) => {
          const digits = String(c.phone || "").replace(/\D/g, "");
          return digits && (digits === want || digits.endsWith(want) || want.endsWith(digits));
        });
        if (byPhone?.id) return String(byPhone.id);
      }
      if (customers[0]?.id) return String(customers[0].id);
    } catch {
      // Try next query / fall through
    }
  }

  // Fallback: email filter on list endpoint
  if (emailQ) {
    try {
      const { data } = await client.get("/customers.json", {
        params: { email: emailQ, limit: 5 },
      });
      const match = (data?.customers || []).find(
        (c) => String(c.email || "").trim().toLowerCase() === emailQ,
      );
      if (match?.id) return String(match.id);
    } catch {
      /* ignore */
    }
  }

  return null;
}

async function linkExistingShopifyCustomer(store, customer, externalId) {
  const push = await pushCustomerToShopify(store, externalId, customer);
  if (!push.ok) return { ok: false, error: push.error };
  return { ok: true, externalId: String(externalId), action: "linked_existing" };
}

export async function createCustomerInShopify(store, customer) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const { first_name, last_name } = splitName(customer.customer_name);

  // Prefer linking an existing Shopify customer over creating a duplicate.
  const existingId = await findShopifyCustomerByContact(store, {
    email: customer.email,
    phone: customer.phone,
  });
  if (existingId) {
    return linkExistingShopifyCustomer(store, customer, existingId);
  }

  try {
    const rawPhone = String(customer.phone || "").trim();
    let shopifyPhone;
    if (rawPhone) {
      shopifyPhone = toShopifyPhone(rawPhone);
      if (!shopifyPhone) {
        return {
          ok: false,
          error: `Phone "${rawPhone}" is not valid for Shopify. Use a format like 03001234567 or +923001234567.`,
        };
      }
    }

    const erpAddresses = dedupeErpAddresses(erpAddressesForShopify(customer));
    let addresses;
    if (erpAddresses.length) {
      const ordered = [
        ...erpAddresses.filter((a) => isErpDefaultAddress(a)),
        ...erpAddresses.filter((a) => !isErpDefaultAddress(a)),
      ];
      let defaultAssigned = false;
      addresses = ordered.map((addr) => {
        const makeDefault = !defaultAssigned && isErpDefaultAddress(addr);
        if (makeDefault) defaultAssigned = true;
        return {
          ...shopifyCustomerAddressPayload(customer, addr, { includeCompany: makeDefault }),
          default: makeDefault || undefined,
        };
      });
    } else if (customer.company_name) {
      addresses = [
        {
          ...shopifyCustomerAddressPayload(customer, {}, { includeCompany: true }),
          phone: shopifyPhone,
          default: true,
        },
      ];
    }

    const { data } = await client.post("/customers.json", {
      customer: {
        first_name,
        last_name,
        email: customer.email || undefined,
        phone: shopifyPhone,
        note: customer.note || undefined,
        tags: customerTags(customer),
        addresses,
      },
    });
    const externalId = data?.customer?.id;
    if (!externalId) return { ok: false, error: "Shopify did not return a customer id" };
    return { ok: true, externalId: String(externalId), action: "created" };
  } catch (error) {
    const msg = formatShopifyError(error);
    // Race / missed search: email or phone already exists — attach that customer.
    if (/already been taken|has already been taken/i.test(msg)) {
      const recoveredId = await findShopifyCustomerByContact(store, {
        email: customer.email,
        phone: customer.phone,
      });
      if (recoveredId) {
        return linkExistingShopifyCustomer(store, customer, recoveredId);
      }
    }
    return { ok: false, error: msg };
  }
}

export async function createProductInShopify(store, product, erpVariants = []) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  const variants = Array.isArray(erpVariants) ? erpVariants : [];
  const { options, variants: variantRows } = buildShopifyProductOptions(variants);
  const shopifyVariants =
    variantRows.length > 0
      ? variantRows.map((v) => shopifyVariantPayload(v))
      : [
          {
            option1: "Default Title",
            price: String(product.default_selling_price ?? product.selling_price ?? 0),
          },
        ];

  try {
    const { data } = await client.post("/products.json", {
      product: {
        title: product.product_name,
        body_html: product.description || undefined,
        status: product.status === "inactive" ? "draft" : "active",
        options,
        variants: shopifyVariants,
      },
    });
    const shopifyProduct = data?.product;
    if (!shopifyProduct?.id) return { ok: false, error: "Shopify did not return a product id" };

    const inventoryByErpVariantId = {};
    const shopifyVariantsOut = shopifyProduct.variants || [];
    const bySku = new Map();
    for (const sv of shopifyVariantsOut) {
      const sku = String(sv.sku || "").trim().toLowerCase();
      if (sku) bySku.set(sku, sv);
    }
    for (const erpV of variantRows) {
      const skuKey = String(erpV.sku || "").trim().toLowerCase();
      let shopifyV = skuKey ? bySku.get(skuKey) : null;
      if (!shopifyV && variantRows.length === 1 && shopifyVariantsOut.length === 1) {
        shopifyV = shopifyVariantsOut[0];
      }
      if (shopifyV?.inventory_item_id) {
        inventoryByErpVariantId[erpV.id] = shopifyV.inventory_item_id;
      }
    }

    return {
      ok: true,
      externalId: String(shopifyProduct.id),
      action: "created",
      inventoryByErpVariantId,
    };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

function mapOrderFinancialStatus(paymentStatus) {
  const status = String(paymentStatus || "").toLowerCase();
  if (status === "paid") return "paid";
  if (status === "partial") return "partially_paid";
  if (status === "refunded") return "refunded";
  if (status === "failed") return "voided";
  return "pending";
}

export async function createOrderInShopify(store, order, { customerExternalId = null } = {}, lineItems = []) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  if (!lineItems.length) {
    return {
      ok: false,
      error:
        "No order lines could be matched to Shopify products. Create or link products in Shopify first.",
    };
  }

  const shopifyPhone = toShopifyPhone(order.customer_phone);
  let resolvedCustomerId = parseShopifyNumericId(customerExternalId);

  // Reuse existing Shopify customer by email/phone so order create doesn't
  // register a duplicate (customer.email_address has already been taken).
  if (!resolvedCustomerId && (order.customer_email || order.customer_phone)) {
    const foundId = await findShopifyCustomerByContact(store, {
      email: order.customer_email,
      phone: order.customer_phone,
    });
    resolvedCustomerId = parseShopifyNumericId(foundId);
  }

  const buildPayload = (customerId) => {
    const payload = {
      order: {
        line_items: lineItems,
        financial_status: mapOrderFinancialStatus(order.payment_status),
        note: order.notes || undefined,
        tags: order.tags || undefined,
        email: order.customer_email || undefined,
        phone: shopifyPhone,
        send_receipt: false,
        send_fulfillment_receipt: false,
      },
    };
    if (customerId) {
      payload.order.customer = { id: customerId };
    }
    if (order.delivery_address || order.city) {
      payload.order.shipping_address = {
        address1: order.delivery_address || undefined,
        city: order.city || undefined,
        province: order.delivery_state || order.state || undefined,
        zip: order.delivery_postal_code || order.postal_code || undefined,
        country: order.delivery_country || order.country || undefined,
        phone: shopifyPhone,
        name: order.customer_name || undefined,
      };
    }
    return payload;
  };

  try {
    const { data } = await client.post("/orders.json", buildPayload(resolvedCustomerId));
    const externalId = data?.order?.id;
    if (!externalId) return { ok: false, error: "Shopify did not return an order id" };
    return {
      ok: true,
      externalId: String(externalId),
      action: "created",
      customerExternalId: resolvedCustomerId ? String(resolvedCustomerId) : null,
    };
  } catch (error) {
    const msg = formatShopifyError(error);
    if (!/email.*already been taken|customer\.email_address/i.test(msg)) {
      return { ok: false, error: msg };
    }
    try {
      const foundId = await findShopifyCustomerByContact(store, {
        email: order.customer_email,
        phone: order.customer_phone,
      });
      const retryCustomerId = parseShopifyNumericId(foundId);
      if (!retryCustomerId) return { ok: false, error: msg };
      const { data } = await client.post("/orders.json", buildPayload(retryCustomerId));
      const externalId = data?.order?.id;
      if (!externalId) return { ok: false, error: msg };
      return {
        ok: true,
        externalId: String(externalId),
        action: "created",
        customerExternalId: String(retryCustomerId),
      };
    } catch (retryErr) {
      return { ok: false, error: formatShopifyError(retryErr) || msg };
    }
  }
}

export async function createLocationInShopify(store, warehouse) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const { data } = await client.post("/locations.json", {
      location: {
        name: warehouse.warehouse_name,
        address1: warehouse.location || undefined,
        city: warehouse.city || undefined,
        active: warehouse.status !== "inactive",
      },
    });
    const externalId = data?.location?.id;
    if (!externalId) return { ok: false, error: "Shopify did not return a location id" };
    return { ok: true, externalId: String(externalId), action: "created" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function pushLocationToShopify(store, externalId, warehouse, { beforeWarehouse = null } = {}) {
  const client = shopifyClient({ storeUrl: store.store_url, accessToken: store.access_token });
  try {
    const locationPayload = { id: Number(externalId) };
    let hasChanges = false;
    if (!beforeWarehouse || erpFieldChanged(beforeWarehouse, warehouse, "warehouse_name")) {
      locationPayload.name = warehouse.warehouse_name;
      hasChanges = true;
    }
    if (!beforeWarehouse || erpFieldChanged(beforeWarehouse, warehouse, "location")) {
      locationPayload.address1 = warehouse.location || undefined;
      hasChanges = true;
    }
    if (!beforeWarehouse || erpFieldChanged(beforeWarehouse, warehouse, "city")) {
      locationPayload.city = warehouse.city || undefined;
      hasChanges = true;
    }
    const active = warehouse.status !== "inactive";
    const beforeActive = beforeWarehouse ? beforeWarehouse.status !== "inactive" : null;
    if (!beforeWarehouse || beforeActive !== active) {
      locationPayload.active = active;
      hasChanges = true;
    }
    if (!hasChanges) return { ok: true, action: "unchanged" };
    await client.put(`/locations/${externalId}.json`, { location: locationPayload });
    return { ok: true, action: "updated" };
  } catch (error) {
    return { ok: false, error: formatShopifyError(error) };
  }
}

export async function logPushResult(storeId, tenantId, entityType, externalId, result) {
  await addSyncLog(storeId, tenantId, {
    syncType: `erp_push:${entityType}`,
    externalId: String(externalId),
    status: result.ok ? "success" : "failed",
    message: result.ok ? `Pushed ${entityType} to Shopify` : result.error || "Push failed",
  });
}
