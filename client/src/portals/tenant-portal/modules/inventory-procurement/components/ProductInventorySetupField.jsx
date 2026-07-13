import { FormField } from "../../../../../components/FormField";
import { SearchableSelect } from "../../../../../components/SearchableSelect";
import { WarehouseIcon } from "../../../../../components/icons";
import { INTEGRATION_DESTINATIONS } from "../../ecommerce/constants";

/**
 * Opening stock setup on product create — applies to every variant automatically.
 */
export function ProductInventorySetupField({
  embedded = false,
  enabled,
  onEnabledChange,
  warehouseId,
  onWarehouseIdChange,
  initialQty,
  onInitialQtyChange,
  warehouseOptions = [],
  disabled = false,
  saveDestination = null,
  shopifyConnected = false,
}) {
  const syncsToShopify =
    saveDestination === INTEGRATION_DESTINATIONS.SHOPIFY && shopifyConnected;
  const syncsToDaraz =
    saveDestination === INTEGRATION_DESTINATIONS.DARAZ;
  const warehouseLabel =
    warehouseOptions.find((w) => w.value === String(warehouseId))?.label || "warehouse";

  const content = !warehouseOptions.length ? (
    <div className="wh-product-sync-card wh-product-sync-card--muted">
      <div className="wh-product-sync-card__icon wh-product-sync-card__icon--warning">
        <WarehouseIcon />
      </div>
      <div className="wh-product-sync-card__content">
        <p className="wh-product-sync-card__title">No warehouse yet</p>
        <p className="wh-product-sync-card__desc">
          Create a warehouse under Inventory to track opening stock for new products.
        </p>
      </div>
    </div>
  ) : (
    <div className={`wh-product-sync-card${enabled ? " wh-product-sync-card--active" : ""}`}>
      <div className="wh-product-sync-card__head">
        <div className="wh-product-sync-card__icon">
          <WarehouseIcon />
        </div>
        <div className="wh-product-sync-card__intro">
          <p className="wh-product-sync-card__title">Opening stock</p>
          <p className="wh-product-sync-card__desc">
            Apply the same quantity to every variant automatically.
          </p>
        </div>
        <label className="wh-toggle wh-product-sync-card__toggle" title={enabled ? "Disable opening stock" : "Enable opening stock"}>
          <span className="wh-toggle__track" aria-hidden="true">
            <input
              type="checkbox"
              checked={Boolean(enabled)}
              disabled={disabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
            />
            <span className="wh-toggle__thumb" />
          </span>
        </label>
      </div>

      {enabled ? (
        <div className="wh-product-sync-card__body">
          <div className="wh-product-sync-fields">
            <SearchableSelect
              id="default_warehouse_id"
              label="Warehouse"
              options={warehouseOptions}
              value={warehouseId || ""}
              onChange={onWarehouseIdChange}
              placeholder="Select warehouse…"
              disabled={disabled}
            />
            <FormField
              id="default_initial_qty"
              label="Qty per variant"
              type="number"
              min="0"
              step="1"
              value={initialQty}
              onChange={(e) => onInitialQtyChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="wh-product-sync-meta">
            <span className="wh-product-sync-meta__chip">
              {warehouseLabel}
            </span>
            <span className="wh-product-sync-meta__chip wh-product-sync-meta__chip--accent">
              {Number(initialQty) || 0} units × each variant
            </span>
            {syncsToShopify && (
              <span className="wh-product-sync-meta__chip wh-product-sync-meta__chip--success">
                Syncs to Shopify on save
              </span>
            )}
            {syncsToDaraz && (
              <span className="wh-product-sync-meta__chip wh-product-sync-meta__chip--success">
                Syncs to Daraz on save
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="wh-product-sync-card__foot wh-muted">
          Turn on to set warehouse quantities without editing each variant row.
        </p>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="wh-form-block">
      <div className="wh-form-block__header">
        <h3 className="wh-form-block__title">Inventory stock</h3>
        <p className="wh-form-block__desc">Set opening quantities for every variant in one step.</p>
      </div>
      <div className="wh-form-block__body">{content}</div>
    </div>
  );
}

/** Merge default warehouse stock into every variant row (create flow). */
export function applyDefaultWarehouseStocks(rows, { enabled, warehouseId, initialQty }) {
  if (!enabled || !warehouseId || !rows?.length) return rows;
  const qty = Math.max(0, Number(initialQty) || 0);
  const whId = Number(warehouseId);
  return rows.map((row) => ({
    ...row,
    warehouse_stocks: [
      {
        warehouse_id: whId,
        initial_qty: String(qty),
        reserved_qty: "0",
        damaged_qty: "0",
        stock_notes: "",
      },
    ],
  }));
}
