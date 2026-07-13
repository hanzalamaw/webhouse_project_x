import { INTEGRATION_DESTINATIONS, INTEGRATION_DESTINATION_LABELS } from "../constants";
import { destinationHelpText } from "../utils/integrationDestination";

/**
 * Top-of-page save destination control: ERP / Shopify / Daraz as segmented buttons.
 */
export function IntegrationDestinationField({
  value,
  onChange,
  disabled = false,
  shopifyConnected = false,
  darazConnected = false,
  shopifyStoreName = "",
  darazStoreName = "",
  showDaraz = true,
  lockedPlatform = null,
  lockedStoreName = "",
  label = "Save to",
  error,
}) {
  if (lockedPlatform) {
    const platformLabel = INTEGRATION_DESTINATION_LABELS[lockedPlatform] || lockedPlatform;
    const syncNote = lockedPlatform === "daraz"
      ? "Saving updates Daraz as well (details, price, and stock)."
      : "Saving updates the linked store as well.";
    return (
      <div className="wh-save-dest wh-save-dest--locked" role="status">
        <div className="wh-save-dest__locked-chip">
          <span className="wh-save-dest__locked-label">Linked</span>
          <strong>{platformLabel}</strong>
          {lockedStoreName ? <span className="wh-save-dest__locked-store">{lockedStoreName}</span> : null}
        </div>
        <p className="wh-save-dest__help">{syncNote}</p>
      </div>
    );
  }

  const options = [
    {
      id: INTEGRATION_DESTINATIONS.ERP,
      label: "ERP only",
      hint: "Local catalog",
      enabled: true,
    },
    {
      id: INTEGRATION_DESTINATIONS.SHOPIFY,
      label: "Shopify",
      hint: shopifyConnected ? (shopifyStoreName || "Connected") : "Not connected",
      enabled: shopifyConnected,
    },
  ];

  if (showDaraz) {
    options.push({
      id: INTEGRATION_DESTINATIONS.DARAZ,
      label: "Daraz",
      hint: darazConnected ? (darazStoreName || "Connected") : "Not connected",
      enabled: darazConnected,
    });
  }

  const help = destinationHelpText(value, { shopifyStoreName, darazStoreName });

  return (
    <div className={`wh-save-dest${error ? " wh-save-dest--error" : ""}`}>
      <div className="wh-save-dest__bar">
        <span className="wh-save-dest__label">{label}</span>
        <div className="wh-save-dest__segment" role="group" aria-label={label}>
          {options.map((opt) => {
            const active = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`wh-save-dest__btn${active ? " is-active" : ""}${!opt.enabled ? " is-disabled" : ""}`}
                disabled={disabled || !opt.enabled}
                onClick={() => onChange(opt.id)}
                title={!opt.enabled ? `Connect ${opt.label} in Integrations first` : opt.hint}
                aria-pressed={active}
              >
                <span className="wh-save-dest__btn-label">{opt.label}</span>
                <span className="wh-save-dest__btn-hint">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="wh-save-dest__help">{help}</p>
      {error ? <p className="wh-field__error">{error}</p> : null}
      {!shopifyConnected && !darazConnected && !error && (
        <p className="wh-save-dest__hint">
          Connect Shopify or Daraz under Integrations to enable store options.
        </p>
      )}
    </div>
  );
}
