import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { fetchAllTableRows } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { FormBlock } from "../../../../../../components/FormBlock";
import { FormPageLayout } from "../../../../../../components/FormPageLayout";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { DetailValue } from "../../../../../../components/DetailValue";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MOVEMENT_LABELS, MODULE_BASE } from "../../constants";

const LIST_API = "/pos/inventory/stock-movements";

export default function ViewStockMovement() {
  const { movementId } = useParams();
  const location = useLocation();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const backPath = location.state?.backPath || `${MODULE_BASE}/procurement/movement-history`;
  const [movement, setMovement] = useState(location.state?.movement ?? null);
  const [loading, setLoading] = useState(!location.state?.movement);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchAllTableRows(LIST_API, authFetch);
      const found = rows.find((r) => String(r.id) === String(movementId));
      if (!found) {
        setMovement(null);
        setError("Movement not found");
      } else {
        setMovement(found);
      }
    } catch (e) {
      setMovement(null);
      setError(e.message || "Movement not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, movementId]);

  useEffect(() => {
    if (location.state?.movement) return;
    load().catch(() => {});
  }, [load, location.state?.movement]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!movement) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Movement not found"}</div>
          <Button variant="secondary" onClick={() => navigate(backPath)}>Back</Button>
        </FormPageLayout>
      </div>
    );
  }

  const typeLabel = MOVEMENT_LABELS[movement.movement_type] || movement.movement_type;

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title={typeLabel}
          description={`${movement.product_name} · ${formatDateTime(movement.created_at)}`}
          actions={
            <Button variant="secondary" onClick={() => navigate(backPath)}>Back to history</Button>
          }
        />

        <FormBlock title="Product" description="Product included in this movement.">
          <div className="wh-inv-line-item">
            <div className="wh-inv-line-item__head">
              <strong>{movement.product_name}</strong>
              <span className="wh-muted">{movement.sku}</span>
            </div>
          </div>
        </FormBlock>

        <FormBlock title="Store" description="Store where this movement was recorded.">
          <div className="wh-form-grid">
            <DetailValue label="Store">{movement.outlet_name}</DetailValue>
          </div>
        </FormBlock>

        <FormBlock title="Quantities & notes" description="Recorded quantity and notes.">
          <div className="wh-form-grid">
            <DetailValue label="Quantity">{movement.qty}</DetailValue>
            <DetailValue label="Notes">{movement.notes || "—"}</DetailValue>
          </div>
        </FormBlock>

        <FormBlock title="Record info">
          <div className="wh-form-grid">
            <DetailValue label="Movement type">
              <StatusBadge status={typeLabel} />
            </DetailValue>
            <DetailValue label="Recorded by">{movement.created_by_name || "—"}</DetailValue>
            <DetailValue label="Date">{formatDateTime(movement.created_at)}</DetailValue>
          </div>
        </FormBlock>
      </FormPageLayout>
    </div>
  );
}
