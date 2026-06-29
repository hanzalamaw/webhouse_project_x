import crypto from "crypto";

export function signDarazRequest(apiPath, params, appSecret) {
  const sortedKeys = Object.keys(params).sort();
  let base = apiPath;
  for (const key of sortedKeys) {
    base += `${key}${params[key]}`;
  }
  return crypto.createHmac("sha256", appSecret).update(base).digest("hex").toUpperCase();
}

export function buildDarazUrl(baseUrl, apiPath, credentials, businessParams = {}) {
  const { apiKey, apiSecret, accessToken } = credentials;
  const timestamp = Date.now().toString();

  const params = {
    app_key: apiKey,
    timestamp,
    sign_method: "sha256",
    ...businessParams,
  };

  if (accessToken) {
    params.access_token = accessToken;
  }

  params.sign = signDarazRequest(apiPath, params, apiSecret);

  const url = new URL(baseUrl.replace(/\/$/, "") + apiPath);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function resolveDarazBaseUrl(storeUrl) {
  const trimmed = (storeUrl || "").trim().replace(/\/$/, "");
  if (!trimmed) return "https://api.daraz.pk/rest";
  if (trimmed.includes("/rest")) return trimmed;
  if (trimmed.startsWith("http")) return `${trimmed}/rest`;
  return `https://${trimmed}/rest`;
}
