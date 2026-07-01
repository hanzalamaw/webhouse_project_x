import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Button } from "../../../../../../components/Button";
import { DetailGrid, DetailValue, RecordViewSummary } from "../../../../../../components/RecordView";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE, MOVEMENT_LABELS } from "../../constants";
import { ViewKpi, ViewPanel, formatCount } from "../../components/EntityViewLayout";
import { ProductIcon, WarehouseIcon, LogsIcon } from "../../../../../../components/icons";

export default function WarehouseView() {
  const { warehouseId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("inventory-procurement");
  const navigate = useNavigate();
  const [warehouse, setWarehouse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setWarehouse(await apiFetch(`/inventory/warehouses/${warehouseId}`, {}, authFetch));
    } catch (e) {
      setWarehouse(null);
      setError(e.message || "Warehouse not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, warehouseId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  if (loading) {
    return <div className="wh-page wh-page--wide"><p className="wh-muted">Loading…</p></div>;
  }

  if (!warehouse) {
    return (
      <div className="wh-page wh-page--wide">
        <div className="wh-alert wh-alert--error">{error || "Warehouse not found"}</div>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/warehouses`)}>Back</Button>
      </div>
    );
  }

  const stats = warehouse.stats || {};
  const stockLines = warehouse.stock_lines || [];
  const movements = warehouse.recent_movements || [];

  const openProduct = (id) => {
    window.open(`${MODULE_BASE}/products/view/${id}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Warehouse details"
        description="Stock on hand, product lines, and recent movement activity."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/warehouses`)}>Back</Button>
            {canEdit && (
              <Button onClick={() => navigate(`${MODULE_BASE}/warehouses/edit/${warehouseId}`)}>Edit warehouse</Button>
            )}
          </>
        }
      />

      <RecordViewSummary
        title={warehouse.warehouse_name}
        subtitle={[warehouse.location, warehouse.city].filter(Boolean).join(" · ") || "No location set"}
        status={warehouse.status}
        chips={[
          { label: "Products", value: formatCount(stats.product_count) },
          { label: "Variants", value: formatCount(stats.variant_count) },
        ]}
      />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Total stock"
            value={formatCount(stats.total_units)}
            hint={`${formatCount(stats.available_units)} available`}
            tone="success"
            icon={<WarehouseIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Products"
            value={formatCount(stats.product_count)}
            hint={`${formatCount(stats.variant_count)} variant SKUs`}
            tone="accent"
            icon={<ProductIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Reserved"
            value={formatCount(stats.reserved_units)}
            hint={`${formatCount(stats.damaged_units)} damaged`}
            tone="warning"
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Stock value"
            value={formatPKR(stats.stock_value_cost)}
            hint={`Retail ${formatPKR(stats.stock_value_retail)}`}
            icon={<LogsIcon />}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <ViewPanel title="Stock in warehouse" subtitle="Products and variants with quantity on hand" flush>
            {stockLines.length > 0 ? (
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Available</th>
                    <th>Total</th>
                    <th>Reserved</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLines.map((row) => (
                    <tr
                      key={`${row.product_id}-${row.variant_id}`}
                      className="wh-table__row--clickable"
                      onClick={() => openProduct(row.product_id)}
                    >
                      <td>
                        {row.product_name}
                        {row.variant_name && row.variant_name !== row.product_name ? ` — ${row.variant_name}` : ""}
                      </td>
                      <td className="wh-muted">{row.sku || "—"}</td>
                      <td>{row.available_qty ?? 0}</td>
                      <td>{row.total_qty ?? 0}</td>
                      <td>{row.reserved_qty ?? 0}</td>
                      <td>{formatPKR((Number(row.available_qty) || 0) * (Number(row.cost_price) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="wh-panel__empty">No stock recorded in this warehouse yet.</p>
            )}
          </ViewPanel>
        </div>
        <div className="wh-dash-col-4">
          <ViewPanel title="Recent movements" subtitle="Latest stock activity" flush>
            {movements.length > 0 ? (
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{MOVEMENT_LABELS[m.movement_type] || m.movement_type}</td>
                      <td>{m.qty}</td>
                      <td className="wh-muted">{formatDateTime(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="wh-panel__empty">No movements recorded yet.</p>
            )}
          </ViewPanel>
        </div>
      </div>

      <ViewPanel title="Location details">
        <DetailGrid columns={3}>
          <DetailValue label="Location">{warehouse.location || "—"}</DetailValue>
          <DetailValue label="City">{warehouse.city || "—"}</DetailValue>
          <DetailValue label="Created">{formatDateTime(warehouse.created_at)}</DetailValue>
        </DetailGrid>
      </ViewPanel>
    </div>
  );
}
