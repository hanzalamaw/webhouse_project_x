import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, fetchAllTableRows } from "../../../../../api/client";

/** Load orders for after-sales forms, ensuring ?orderId= from Order View is present and pre-selected. */
export function useAfterSalesOrders(authFetch) {
  const [searchParams] = useSearchParams();
  const prefillOrderId = searchParams.get("orderId") || "";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await fetchAllTableRows("/orders", authFetch);
        let list = rows;

        if (prefillOrderId) {
          const found = rows.some((o) => String(o.id) === String(prefillOrderId));
          if (!found) {
            try {
              const order = await apiFetch(`/orders/${prefillOrderId}`, {}, authFetch);
              if (order?.id) list = [order, ...rows];
            } catch {
              // Keep list as-is if direct fetch fails.
            }
          }
        }

        if (!cancelled) setOrders(list);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authFetch, prefillOrderId]);

  return { orders, loading, error, prefillOrderId };
}
