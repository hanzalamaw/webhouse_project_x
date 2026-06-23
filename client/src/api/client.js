import { API_BASE } from "../config/api";

export async function apiFetch(path, options = {}, authFetch = fetch) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await authFetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export const LOGIN_PORTALS = [
  { value: "erp1", label: "ERP 1" },
  { value: "erp2", label: "ERP 2" },
  { value: "erp3", label: "ERP 3" },
];

export function loginPortalUrl(portal) {
  if (!portal) return "";
  return `${window.location.origin}/${portal}`;
}

export const TENANT_STATUS = ["active", "suspended", "inactive"];
export const SUBSCRIPTION_STATUS = ["active", "cancelled", "expired", "pending"];
export const BILLING_CYCLES = ["monthly", "yearly"];

export const WIZARD_DRAFT_KEY = "wh_create_tenant_draft";
