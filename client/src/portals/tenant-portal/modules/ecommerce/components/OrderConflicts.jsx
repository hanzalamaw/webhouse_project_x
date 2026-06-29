import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { ecomApiGet, ecomApiPost } from "../api/ecommerceClient";
import { Card } from "../../../../../components/Card";
import { Button } from "../../../../../components/Button";
import { formatPKR } from "../../../../../utils/currency";

function orderLabel(order) {
  if (!order) return "Order";
  return order.erpOrderId || order.externalId || "Order";
}

function orderSummary(order) {
  if (!order) return "";
  const customer = order.customer?.name || "Customer";
  const total = order.total != null ? formatPKR(order.total) : "";
  const status = order.status || "";
  return [customer, total, status].filter(Boolean).join(" · ");
}

export default function OrderConflicts({ platform }) {
  const { authFetch } = useAuth();
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ecomApiGet(platform, "sync/conflicts", authFetch);
      setConflicts(data.conflicts || []);
    } catch {
      setConflicts([]);
    } finally {
      setLoading(false);
    }
  }, [platform, authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (externalId, action) => {
    setResolvingId(externalId);
    try {
      await ecomApiPost(`${platform}`, `sync/conflicts/${encodeURIComponent(externalId)}/resolve`, authFetch, {
        action,
      });
      await load();
    } finally {
      setResolvingId(null);
    }
  };

  if (loading || conflicts.length === 0) return null;

  return (
    <div style={{ marginTop: "1rem" }}>
    <Card>
      <h3 className="wh-card__title">Orders needing your review</h3>
      <p className="wh-muted" style={{ margin: "0.35rem 0 1rem" }}>
        These orders were updated on the marketplace. Choose whether to keep what you already have or
        update with the newly synced details.
      </p>
      <div className="wh-mini-list">
        {conflicts.map((c) => (
          <div key={c.externalId} className="wh-mini-row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
            <div className="wh-mini-row__main" style={{ flex: "1 1 220px" }}>
              <div className="wh-mini-row__title">{orderLabel(c.current)}</div>
              <div className="wh-mini-row__sub">
                <strong>Current:</strong> {orderSummary(c.current)}
              </div>
              <div className="wh-mini-row__sub">
                <strong>New sync:</strong> {orderSummary(c.incoming)}
              </div>
            </div>
            <div className="wh-action-btns">
              <Button
                variant="secondary"
                className="wh-btn--sm"
                disabled={resolvingId === c.externalId}
                onClick={() => resolve(c.externalId, "keep")}
              >
                Keep existing
              </Button>
              <Button
                className="wh-btn--sm"
                disabled={resolvingId === c.externalId}
                onClick={() => resolve(c.externalId, "update")}
              >
                Update from sync
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
    </div>
  );
}
