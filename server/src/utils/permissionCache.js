const DEFAULT_TTL_MS = 60_000;

/** Process-local TTL cache for tenant permission / manifest resolution. */
const store = new Map();

function cacheKey(tenantId, userId, impersonating = false) {
  return `${tenantId}:${userId}:${impersonating ? "1" : "0"}`;
}

export const permissionCache = {
  get(tenantId, userId, { impersonating = false } = {}) {
    const key = cacheKey(tenantId, userId, impersonating);
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  set(tenantId, userId, value, { impersonating = false, ttlMs = DEFAULT_TTL_MS } = {}) {
    const key = cacheKey(tenantId, userId, impersonating);
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  },

  invalidateUser(tenantId, userId) {
    const prefix = `${tenantId}:${userId}:`;
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },

  invalidateTenant(tenantId) {
    const prefix = `${tenantId}:`;
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },

  clear() {
    store.clear();
  },
};
