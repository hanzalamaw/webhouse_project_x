import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { API_BASE } from "../../../../../config/api";

export async function fetchEcomLink(authFetch, entityType, entityId) {
  if (!entityType || !entityId) return null;
  const res = await authFetch(
    `${API_BASE}/ecommerce/sync/link?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
  );
  const data = await res.json();
  return data.linked ? data : null;
}

/** @deprecated Use fetchEcomLink */
export const fetchShopifyLink = fetchEcomLink;

/**
 * Returns store link info when an ERP record is tied to Shopify or Daraz.
 * Uses ecom_entity_links (and location links for warehouses) as source of truth.
 */
export function useEcomSyncLink(entityType, entityId, { enabled = true } = {}) {
  const { authFetch } = useAuth();
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !entityId) {
      setLink(null);
      return null;
    }
    setLoading(true);
    try {
      const next = await fetchEcomLink(authFetch, entityType, entityId);
      setLink(next);
      return next;
    } catch {
      setLink(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [authFetch, entityType, entityId, enabled]);

  useEffect(() => {
    if (!enabled || !entityId) {
      setLink(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    fetchEcomLink(authFetch, entityType, entityId)
      .then((next) => active && setLink(next))
      .catch(() => active && setLink(null))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [authFetch, entityType, entityId, enabled]);

  return {
    link,
    loading,
    isLinked: Boolean(link),
    isShopifyLinked: link?.platform === "shopify",
    isDarazLinked: link?.platform === "daraz",
    refresh,
  };
}

/** @deprecated Use useEcomSyncLink */
export function useShopifySyncLink(entityType, entityId, options) {
  const result = useEcomSyncLink(entityType, entityId, options);
  return {
    ...result,
    isShopifyLinked: result.isShopifyLinked,
  };
}
