/** Match server normalizeShopDomain — keep install request and OAuth state aligned. */
export function normalizeShopifyDomain(shop) {
  let domain = String(shop || "").trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0].replace(/\.+$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("Invalid shop domain. Use mystore or mystore.myshopify.com");
  }
  return domain;
}
