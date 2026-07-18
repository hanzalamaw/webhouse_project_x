import axios from "axios";
import { buildDarazUrl, resolveDarazBaseUrl } from "../../utils/darazSign.js";
import { getDarazConfig } from "./darazConfig.js";

const API_TZ_OFFSET = {
  "api.daraz.pk": "+05:00",
  "api.daraz.com.bd": "+06:00",
  "api.daraz.lk": "+05:30",
  "api.daraz.com.np": "+05:45",
  "api.shop.com.mm": "+06:30",
};

/** Decimal places allowed for product prices by marketplace host. */
const PRICE_DECIMALS_BY_HOST = {
  "api.daraz.pk": 0,
  "api.daraz.com.bd": 2,
  "api.daraz.lk": 2,
  "api.daraz.com.np": 2,
  "api.shop.com.mm": 2,
};

export function normalizeDarazApiHost(apiBase) {
  return String(apiBase || "api.daraz.pk")
    .replace(/^https?:\/\//, "")
    .replace(/\/rest$/, "")
    .toLowerCase();
}

export function darazPriceDecimals(apiBase) {
  const host = normalizeDarazApiHost(apiBase);
  return PRICE_DECIMALS_BY_HOST[host] ?? 2;
}

/** Format a price for Daraz XML (PK = whole rupees; others = 2 dp). */
export function formatDarazPrice(value, apiBase) {
  const decimals = darazPriceDecimals(apiBase);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return decimals === 0 ? "0" : "0.00";
  if (decimals === 0) return String(Math.round(n));
  return n.toFixed(decimals);
}

export function orderFetchParams(apiBase) {
  const host = normalizeDarazApiHost(apiBase);
  const tz = API_TZ_OFFSET[host] || "+05:00";
  return {
    sort_by: "created_at",
    sort_direction: "DESC",
    created_after: `2020-01-01T00:00:00${tz}`,
  };
}

/** Flatten Daraz `detail` arrays/objects into a readable suffix. */
export function formatDarazDetail(detail) {
  if (detail == null || detail === "") return "";
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail)) {
    return detail
      .map((row) => {
        if (row == null) return "";
        if (typeof row === "string") return row;
        const code = row.code ?? row.error_code ?? row.errorCode ?? "";
        const msg = row.message || row.msg || row.field || row.seller_sku || row.SellerSku || "";
        const sku = row.seller_sku || row.SellerSku || row.sku_id || row.SkuId || "";
        const parts = [code, msg, sku ? `SKU ${sku}` : ""].filter(Boolean);
        return parts.join(" — ") || JSON.stringify(row);
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    const code = detail.code ?? detail.error_code ?? "";
    const msg = detail.message || detail.msg || "";
    if (code || msg) return [code, msg].filter(Boolean).join(": ");
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

export function unwrapDarazResponse(data) {
  if (data.code !== "0" && data.code !== 0) {
    const code = data.code != null ? String(data.code) : "";
    const msg = data.message || data.msg || `Daraz API error${code ? ` ${code}` : ""}`;
    const detailText = formatDarazDetail(data.detail ?? data.details ?? data.error_detail);
    let full = code && !String(msg).includes(code) ? `${code}: ${msg}` : msg;
    if (detailText && !full.includes(detailText)) {
      full = `${full} (${detailText})`;
    }
    const err = new Error(full);
    err.response = { data };
    err.darazCode = code;
    err.darazDetail = detailText;
    throw err;
  }
  return data.data || data.result || data;
}

export function darazCredentialsForStore(store) {
  const config = getDarazConfig();
  return {
    apiKey: config.appKey,
    apiSecret: config.appSecret,
    accessToken: store.access_token,
  };
}

export function apiBaseFromStore(store) {
  const match = store.store_url?.match(/^daraz:([^:]+)/);
  return match ? match[1] : getDarazConfig().apiBase;
}

export async function darazApiGet(
  apiBase,
  apiPath,
  credentials,
  businessParams = {},
  { withToken = true } = {},
) {
  const baseUrl = resolveDarazBaseUrl(apiBase);
  const creds = withToken
    ? credentials
    : { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, accessToken: undefined };

  const params = { ...businessParams };
  const url = buildDarazUrl(baseUrl, apiPath, creds, params);
  const { data } = await axios.get(url, { timeout: 60000 });
  return data;
}

/**
 * Daraz write APIs (create/update/price_quantity) — signed query params, optional payload body param.
 * Most product write endpoints expect `payload` as an XML (or JSON) string in businessParams.
 */
export async function darazApiPost(
  apiBase,
  apiPath,
  credentials,
  businessParams = {},
  { withToken = true } = {},
) {
  const baseUrl = resolveDarazBaseUrl(apiBase);
  const creds = withToken
    ? credentials
    : { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret, accessToken: undefined };

  const params = { ...businessParams };
  const url = buildDarazUrl(baseUrl, apiPath, creds, params);
  const { data } = await axios.post(url, null, {
    timeout: 60000,
    headers: { "Content-Type": "application/json;charset=utf-8" },
  });
  return data;
}

export function extractList(result, ...keys) {
  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
  }
  return Array.isArray(result) ? result : [];
}

export async function fetchAllDaraz(apiBase, apiPath, creds, businessParams, ...listKeys) {
  const pageSize = 50;
  let offset = 0;
  const all = [];

  while (true) {
    const data = await darazApiGet(apiBase, apiPath, creds, {
      ...businessParams,
      offset: String(offset),
      limit: String(pageSize),
    });
    const result = unwrapDarazResponse(data);
    const batch = extractList(result, ...listKeys);
    all.push(...batch);

    const total = result.count_total ?? result.total_products ?? result.count ?? result.total ?? null;
    if (batch.length === 0) break;
    if (batch.length < pageSize) break;
    if (total != null && all.length >= total) break;
    offset += pageSize;
  }

  return all;
}
