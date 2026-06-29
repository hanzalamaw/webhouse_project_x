import { tenantUserRepository } from "../repositories/tenantUserRepository.js";

export function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function resolveTenantId(tenantId) {
  const scopedTenantId = Number(tenantId);
  if (!Number.isFinite(scopedTenantId) || scopedTenantId < 1) {
    const err = new Error("Tenant is required for username validation");
    err.status = 400;
    throw err;
  }
  return scopedTenantId;
}

export function validateUsernameFormat(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    const err = new Error("Username is required");
    err.status = 400;
    throw err;
  }
  if (/\s/.test(String(username))) {
    const err = new Error("Username cannot contain spaces");
    err.status = 400;
    throw err;
  }
  return normalized;
}

export async function assertUsernameAvailable(tenantId, username, excludeUserId = null) {
  const scopedTenantId = resolveTenantId(tenantId);
  const normalized = validateUsernameFormat(username);
  const existing = await tenantUserRepository.findByUsername(scopedTenantId, normalized, excludeUserId);
  if (existing) {
    const err = new Error("Username already exists for this tenant");
    err.status = 400;
    throw err;
  }
  return normalized;
}
