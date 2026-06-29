import { API_BASE } from "../../../../../config/api";

export async function ecomApiGet(platform, path, authFetch) {
  const url = `${API_BASE}/${platform}/${path.replace(/^\//, "")}`;
  const res = await authFetch(url, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export async function ecomApiPost(platform, path, authFetch, body = undefined) {
  const url = `${API_BASE}/${platform}/${path.replace(/^\//, "")}`;
  const res = await authFetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export async function ecomApiPostEmpty(platform, path, authFetch) {
  return ecomApiPost(platform, path, authFetch);
}
