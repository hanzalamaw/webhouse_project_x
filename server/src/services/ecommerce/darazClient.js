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

export function orderFetchParams(apiBase) {
  const host = (apiBase || "api.daraz.pk").replace(/^https?:\/\//, "").replace(/\/rest$/, "");
  const tz = API_TZ_OFFSET[host] || "+05:00";
  return {
    sort_by: "created_at",
    sort_direction: "DESC",
    created_after: `2020-01-01T00:00:00${tz}`,
  };
}

export function unwrapDarazResponse(data) {
  if (data.code !== "0" && data.code !== 0) {
    const code = data.code ? String(data.code) : "";
    const msg = data.message || `Daraz API error${code ? ` ${code}` : ""}`;
    const err = new Error(code && !msg.includes(code) ? `${code}: ${msg}` : msg);
    err.response = { data };
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
