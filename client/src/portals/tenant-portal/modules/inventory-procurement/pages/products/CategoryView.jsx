import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../../../../context/AuthContext";
import { apiFetch } from "../../../../../../api/client";
import { PageHeader } from "../../../../../../components/PageHeader";
import { Button } from "../../../../../../components/Button";
import { StatusBadge } from "../../../../../../components/Badge";
import { DonutChart } from "../../../../../../components/charts";
import { DetailGrid, DetailValue, RecordViewSummary } from "../../../../../../components/RecordView";
import { formatPKR } from "../../../../../../utils/currency";
import { formatDateTime } from "../../../../../../utils/dateTime";
import { MODULE_BASE } from "../../constants";
import { ViewKpi, ViewPanel, formatCount } from "../../components/EntityViewLayout";
import { ProductIcon, WarehouseIcon } from "../../../../../../components/icons";

export default function CategoryView() {
  const { categoryId } = useParams();
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCategory(await apiFetch(`/inventory/categories/${categoryId}`, {}, authFetch));
    } catch (e) {
      setCategory(null);
      setError(e.message || "Category not found");
    } finally {
      setLoading(false);
    }
  }, [authFetch, categoryId]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const assigned = category?.products || [];
  const other = useMemo(
    () => (category?.all_products || []).filter((p) => Number(p.category_id) !== Number(categoryId)),
    [category, categoryId]
  );
  const stats = category?.stats || {};

  const statusDonut = useMemo(() => {
    const active = Number(stats.active_products) || 0;
    const inactive = Number(stats.inactive_products) || 0;
    return [
      { label: "Active", value: active, color: "var(--color-success)" },
      { label: "Inactive", value: inactive, color: "var(--text-muted)" },
    ].filter((s) => s.value > 0);
  }, [stats]);

  if (loading) {
    return <div className="wh-page wh-page--wide"><p className="wh-muted">Loading…</p></div>;
  }

  if (!category) {
    return (
      <div className="wh-page wh-page--wide">
        <div className="wh-alert wh-alert--error">{error || "Category not found"}</div>
        <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/categories`)}>Back</Button>
      </div>
    );
  }

  const openProduct = (id) => {
    window.open(`${MODULE_BASE}/products/view/${id}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="wh-page wh-page--wide">
      <PageHeader
        title="Category details"
        description="Products, stock totals, and catalog breakdown for this category."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/categories`)}>Back</Button>
            <Button variant="secondary" onClick={() => navigate(`${MODULE_BASE}/products/categories`)}>Manage categories</Button>
          </>
        }
      />

      <RecordViewSummary
        title={category.category_name}
        subtitle={`${formatCount(stats.product_count)} products in this category`}
        status={category.status}
      />

      <div className="wh-dash-grid">
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Products"
            value={formatCount(stats.product_count)}
            hint={`${formatCount(stats.active_products)} active · ${formatCount(stats.inactive_products)} inactive`}
            tone="accent"
            icon={<ProductIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Variants"
            value={formatCount(stats.variant_count)}
            hint="SKUs in category"
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Available stock"
            value={formatCount(stats.available_units)}
            hint={`${formatCount(stats.total_units)} total units`}
            tone="success"
            icon={<WarehouseIcon />}
          />
        </div>
        <div className="wh-dash-col-3">
          <ViewKpi
            label="Stock value"
            value={formatPKR(stats.stock_value_cost)}
            hint={`Retail ${formatPKR(stats.stock_value_retail)}`}
            tone="default"
          />
        </div>
      </div>

      <div className="wh-dash-grid">
        <div className="wh-dash-col-8">
          <ViewPanel title="Products in category" subtitle="Click a row to open the product in a new tab" flush>
            {assigned.length > 0 ? (
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKUs</th>
                    <th>Variants</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((p) => (
                    <tr
                      key={p.id}
                      className="wh-table__row--clickable"
                      onClick={() => openProduct(p.id)}
                    >
                      <td>{p.product_name}</td>
                      <td className="wh-muted">{p.skus || "—"}</td>
                      <td>{p.variant_count ?? "—"}</td>
                      <td><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="wh-panel__empty">No products assigned to this category yet.</p>
            )}
          </ViewPanel>
        </div>
        <div className="wh-dash-col-4">
          <ViewPanel title="Product status">
            {statusDonut.length ? (
              <DonutChart
                segments={statusDonut}
                centerValue={statusDonut.reduce((s, x) => s + x.value, 0)}
                centerLabel="products"
              />
            ) : (
              <p className="wh-panel__empty">No products in this category.</p>
            )}
          </ViewPanel>
        </div>
      </div>

      {other.length > 0 && (
        <ViewPanel title="Other catalog products" subtitle="Products not assigned to this category" flush>
          <table className="wh-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Variants</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {other.slice(0, 10).map((p) => (
                <tr
                  key={p.id}
                  className="wh-table__row--clickable"
                  onClick={() => openProduct(p.id)}
                >
                  <td>{p.product_name}</td>
                  <td className="wh-muted">{p.category_name || "Uncategorized"}</td>
                  <td>{p.variant_count ?? "—"}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ViewPanel>
      )}

      <ViewPanel title="Category info">
        <DetailGrid columns={2}>
          <DetailValue label="Created">{formatDateTime(category.created_at)}</DetailValue>
          <DetailValue label="Reserved units">{formatCount(stats.reserved_units)}</DetailValue>
          <DetailValue label="Damaged units">{formatCount(stats.damaged_units)}</DetailValue>
        </DetailGrid>
      </ViewPanel>
    </div>
  );
}
