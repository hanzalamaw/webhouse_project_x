import { FormBlock } from "../../../../../components/FormBlock";
import { ProductInventorySetupField } from "./ProductInventorySetupField";
import { PendingStoreProductsImport } from "../../ecommerce/components/PendingStoreProductsImport";

/**
 * Grouped inventory + store-import shortcuts on product create.
 */
export function ProductSyncSetupSection({
  authFetch,
  importPlatform,
  importConnection,
  importShopQuery = "",
  onStoreImported,
  inventoryStockEnabled,
  onInventoryStockEnabledChange,
  defaultWarehouseId,
  onDefaultWarehouseIdChange,
  defaultInitialQty,
  onDefaultInitialQtyChange,
  warehouseOptions = [],
  saveDestination,
  shopifyConnected,
  disabled = false,
}) {
  const showImport =
    Boolean(importPlatform)
    && importConnection?.initialSyncStatus === "completed";
  const showStock = warehouseOptions.length > 0;

  if (!showImport && !showStock) return null;

  return (
    <FormBlock
      title="Inventory setup"
      description="Track opening stock and pull store catalog — no need to visit Integrations or set stock row by row."
    >
      <div className={`wh-product-sync-group${showImport && showStock ? " wh-product-sync-group--duo" : ""}`}>
        {showImport && (
          <PendingStoreProductsImport
            embedded
            platform={importPlatform}
            authFetch={authFetch}
            connection={importConnection}
            shopQuery={importShopQuery}
            disabled={disabled}
            onImported={onStoreImported}
          />
        )}
        <ProductInventorySetupField
          embedded
          enabled={inventoryStockEnabled}
          onEnabledChange={onInventoryStockEnabledChange}
          warehouseId={defaultWarehouseId}
          onWarehouseIdChange={onDefaultWarehouseIdChange}
          initialQty={defaultInitialQty}
          onInitialQtyChange={onDefaultInitialQtyChange}
          warehouseOptions={warehouseOptions}
          disabled={disabled}
          saveDestination={saveDestination}
          shopifyConnected={shopifyConnected}
        />
      </div>
    </FormBlock>
  );
}
