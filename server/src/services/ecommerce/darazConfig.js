import { resolveDarazBaseUrl } from "../../utils/darazSign.js";

const OAUTH_HOSTS = {
  "api.daraz.pk": "https://api.daraz.pk",
  "api.daraz.com.bd": "https://api.daraz.com.bd",
  "api.daraz.lk": "https://api.daraz.lk",
  "api.daraz.com.np": "https://api.daraz.com.np",
  "api.shop.com.mm": "https://api.shop.com.mm",
};

export function getDarazConfig() {
  const appKey = (process.env.DARAZ_APP_KEY || "").trim();
  const appSecret = (process.env.DARAZ_APP_SECRET || "").trim();
  const apiBase = (process.env.DARAZ_API_BASE || "api.daraz.pk").trim();
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  const webhookBase = (process.env.SHOPIFY_WEBHOOK_BASE_URL || process.env.DARAZ_WEBHOOK_BASE_URL || "")
    .replace(/\/$/, "");

  let redirectUri = (process.env.DARAZ_OAUTH_REDIRECT_URI || "").trim();
  if (!redirectUri && webhookBase) {
    redirectUri = `${webhookBase}/api/daraz/oauth/callback`;
  }

  const apiHost = OAUTH_HOSTS[apiBase] || `https://${apiBase.replace(/^https?:\/\//, "")}`;
  const installUrl = redirectUri ? redirectUri.replace("/oauth/callback", "/oauth/install") : null;

  return {
    appKey,
    appSecret,
    apiBase,
    apiRestBase: resolveDarazBaseUrl(apiBase),
    apiHost,
    redirectUri,
    installUrl,
    authorizeUrl: `${apiHost}/oauth/authorize`,
    frontendUrl,
    frontendIntegrationsUrl: `${frontendUrl}/app/m/ecommerce/integrations`,
    oauthConfigured: Boolean(appKey && appSecret && redirectUri),
  };
}

export function storeUrlForDaraz(apiBase, sellerId) {
  const base = (apiBase || "api.daraz.pk").replace(/^https?:\/\//, "").replace(/\/rest$/, "");
  return sellerId ? `daraz:${base}:seller_${sellerId}` : `daraz:${base}`;
}
