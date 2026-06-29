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
import { MODULE_BASE } from "../../constants";

const LIST_API = "/pos/inventory/stock-transfers";

export default function ViewStockTransfer() {
  const { transferId } = useParams();
  const location = useLocation();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const backPath = `${MODULE_BASE}/procurement/transfers`;
  const [transfer, setTransfer] = useState(location.state?.transfer ?? null);
  const [loading, setLoading] = useState(!location.state?.transfer);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchAllTableRows(LIST_API, authFetch);
      const found = rows.find((r) => String(r.id) === String(transferId));
      if (!found) {
        setTransfer(null);
        setError("Transfer not found");
      } else {
        setTransfer(found);
      }
    } catch (e) {
      setTransfer(null);
      setError(e.message || "Transfer not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, transferId]);

  useEffect(() => {
    if (location.state?.transfer) return;
    load().catch(() => {});
  }, [load, location.state?.transfer]);

  if (loading) {
    return (
      <div className="wh-page">
        <FormPageLayout><p className="wh-muted">Loading…</p></FormPageLayout>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="wh-page">
        <FormPageLayout>
          <div className="wh-alert wh-alert--error">{error || "Transfer not found"}</div>
          <Button variant="secondary" onClick={() => navigate(backPath)}>Back to transfers</Button>
        </FormPageLayout>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <FormPageLayout>
        <PageHeader
          title="Transfer details"
          description={`${transfer.product_name} · ${formatDateTime(transfer.created_at)}`}
          actions={
            <Button variant="secondary" onClick={() => navigate(backPath)}>Back to transfers</Button>
          }
        />

        <FormBlock title="Product" description="Product being transferred.">
          <div className="wh-inv-line-item">
            <div className="wh-inv-line-item__head">
              <strong>{transfer.product_name}</strong>
              <span className="wh-muted">{transfer.sku}</span>
            </div>
          </div>
        </FormBlock>

        <FormBlock title="Stores" description="Source and destination stores.">
          <div className="wh-form-grid">
            <DetailValue label="From store">{transfer.from_outlet_name}</DetailValue>
            <DetailValue label="To store">{transfer.to_outlet_name}</DetailValue>
          </div>
        </FormBlock>

        <FormBlock title="Transfer details">
          <div className="wh-form-grid">
            <DetailValue label="Quantity">{transfer.qty}</DetailValue>
            <DetailValue label="Status"><StatusBadge status={transfer.transfer_status} /></DetailValue>
            <DetailValue label="Created">{formatDateTime(transfer.created_at)}</DetailValue>
            <DetailValue label="Updated">{formatDateTime(transfer.updated_at)}</DetailValue>
            <DetailValue label="Notes" fullWidth>{transfer.notes || "—"}</DetailValue>
          </div>
        </FormBlock>
      </FormPageLayout>
    </div>
  );
}
