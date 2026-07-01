import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { useModulePermission } from "../../../../../../hooks/useModulePermission";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { HBars } from "../../../../../../components/charts";
import { DetailGrid, DetailValue, RecordViewSummary } from "../../../../../../components/RecordView";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE } from "../../constants";
import { SourceBadge } from "../../../ecommerce/components/SourceBadge";
import { ViewKpi, ViewPanel, formatCount } from "../../components/EntityViewLayout";
import { computeProductStats } from "../../utils/productViewStats";
import { ProductIcon, WarehouseIcon } from "../../../../../../components/icons";

export default function ProductView() {
  const { productId } = useParams();
  const { authFetch } = useAuth();
  const { canEdit } = useModulePermission("inventory-procurement");
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProduct(await apiFetch(`/inventory/products/${productId}`, {}, authFetch));
    } catch (e) {
      setProduct(null);
      setError(e.message || "Product not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, productId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const variants = product?.variants || [];
  const stats = useMemo(() => computeProductStats(variants), [variants]);

  if (loading) {
    return <div className="wh-page wh-page--wide"><p className="wh-muted">Loading…</p></div>;
  }

  if (!product) {
    return (
      <div className="wh-page wh-page--wide">
        <div className="wh-alert wh-alert--error">{error || "Product not found"}</div>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>Back</Button>
      </div>
    );
  }

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Product details"
        description="Stock levels, variants, and pricing overview."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/manage`)}>Back</Button>
            {canEdit && (
              <Button onClick={() => navigate(`${MODULE_BASE}/products/edit/${productId}`)}>Edit product</Button>
            )}
          </>
        }
      />

      <RecordViewSummary
        title={product.product_name}
        subtitle={product.category_name || "Uncategorized"}
        status={product.status}
        chips={[
          { label: "Unit", value: product.unit || "—" },
          { label: "Variants", value: String(stats.variant_count) },
        ]}
      />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Available stock"
            value={formatCount(stats.total_available)}
            hint={`${formatCount(stats.total_qty)} total units`}
            tone="success"
            icon={<ProductIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Stock value (cost)"
            value={formatPKR(stats.stock_value_cost)}
            hint={`Retail ${formatPKR(stats.stock_value_retail)}`}
            tone="accent"
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
            label="Stock alerts"
            value={formatCount(stats.low_stock_variants + stats.out_of_stock_variants)}
            hint={`${stats.out_of_stock_variants} out · ${stats.low_stock_variants} low`}
            tone={stats.out_of_stock_variants ? "danger" : "default"}
            icon={<WarehouseIcon />}
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          {variants.length > 0 ? (
            <ViewPanel title="Variants & stock" subtitle="SKU-level availability across warehouses" flush>
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th>Cost</th>
                    <th>Selling</th>
                    <th>Available</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id}>
                      <td>{v.variant_name || "Default"}</td>
                      <td className="wh-muted">{v.sku || "—"}</td>
                      <td>{formatPKR(v.cost_price)}</td>
                      <td>{formatPKR(v.selling_price)}</td>
                      <td>{v.total_available ?? 0}</td>
                      <td>{v.total_qty ?? 0}</td>
                      <td><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ViewPanel>
          ) : (
            <ViewPanel title="Variants & stock">
              <p className="wh-panel__empty">No variants configured for this product.</p>
            </ViewPanel>
          )}
        </div>
        <div className="wh-dash-col-4">
          <ViewPanel title="Stock by warehouse" subtitle="Available units per location">
            {stats.stock_by_warehouse.length ? (
              <HBars data={stats.stock_by_warehouse} />
            ) : (
              <p className="wh-panel__empty">No warehouse stock recorded.</p>
            )}
          </ViewPanel>
        </div>
      </div>

      <ViewPanel title="Product details" subtitle="Pricing, source, and metadata">
        <DetailGrid columns={3}>
          <DetailValue label="Source"><SourceBadge source={product.source} /></DetailValue>
          <DetailValue label="Delivery charges">{formatPKR(product.delivery_charges)}</DetailValue>
          <DetailValue label="Discount">{formatPKR(product.discount)}</DetailValue>
          <DetailValue label="Tax">{formatPKR(product.tax)}</DetailValue>
          <DetailValue label="Category">{product.category_name || "—"}</DetailValue>
          <DetailValue label="Last updated">{formatDateTime(product.updated_at)}</DetailValue>
        </DetailGrid>
      </ViewPanel>
    </div>
  );
}
