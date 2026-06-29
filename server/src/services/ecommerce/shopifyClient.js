import axios from "axios";

export const API_VERSION = "2024-10";

export function normalizeStoreUrl(storeUrl) {
  let url = (storeUrl || "").trim().replace(/\/$/, "");
  if (!url.startsWith("http")) {
    url = `https://${url}`;
  }
  if (!url.includes(".myshopify.com") && !url.includes("shopify")) {
    const host = new URL(url).hostname;
    if (!host.includes("myshopify")) {
      url = `https://${host}.myshopify.com`;
    }
  }
  return url.replace(/\/$/, "");
}

export function shopifyClient(credentials) {
  const baseURL = `${normalizeStoreUrl(credentials.storeUrl)}/admin/api/${API_VERSION}`;
  return axios.create({
    baseURL,
    headers: {
      "X-Shopify-Access-Token": credentials.accessToken,
      "Content-Type": "application/json",
    },
    timeout: 30000,
  });
}

export function handleShopifyError(res, error, label) {
  const status = error.response?.status || 500;
  const message =
    error.response?.data?.errors ||
    error.response?.data?.error ||
    error.message ||
    `${label} failed`;
  res.status(status).json({
    success: false,
    error: typeof message === "object" ? JSON.stringify(message) : String(message),
    raw: error.response?.data || null,
  });
}
