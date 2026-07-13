import { IntegrationDestinationField } from "../../ecommerce/components/IntegrationDestinationField";

/**
 * Top-of-form channel toggle for Create Product — same control as other modules.
 */
export function ProductChannelPicker({
  value,
  onChange,
  shopifyConnected = false,
  darazConnected = false,
  disabled = false,
  shopifyStoreName = "",
  darazStoreName = "",
  error,
}) {
  return (
    <IntegrationDestinationField
      value={value}
      onChange={onChange}
      disabled={disabled}
      shopifyConnected={shopifyConnected}
      darazConnected={darazConnected}
      shopifyStoreName={shopifyStoreName}
      darazStoreName={darazStoreName}
      label="Product is for"
      error={error}
    />
  );
}
