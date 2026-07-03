import { useId, useState } from "react";
import { FormField } from "./FormField";
import { Button } from "./Button";

const OTHER = "__other__";
/** Preset values hidden from the list — use "Other (add new)…" instead */
const HIDDEN_PRESETS = new Set(["other"]);

function defaultLabel(value) {
  return String(value).replace(/_/g, " ");
}

/**
 * Native <select> for order field options, with "Other…" to add a tenant-wide custom value.
 *
 * The selected value is derived from the `value` prop (single source of truth) so the
 * control never fights external updates (edit prefill, resets, etc.). A transient
 * `otherMode` flag only tracks whether the user is currently typing a brand new value.
 */
export function OrderFieldSelect({
  fieldKey,
  value,
  onChange,
  fieldOptions = {},
  onAddOption,
  label,
  labelFor = defaultLabel,
  disabled = false,
  emptyLabel = "Select…",
}) {
  const id = useId();
  const values = fieldOptions[fieldKey] || [];
  const listValues = values.filter((v) => !HIDDEN_PRESETS.has(v));
  const valueInList = listValues.includes(value);

  const [otherMode, setOtherMode] = useState(false);
  const [custom, setCustom] = useState("");

  // A saved custom value (not empty, not a preset) is shown as its own option.
  const showSavedCustom = !otherMode && value && !valueInList && value !== "other";
  const selectValue = otherMode ? OTHER : (value || "");

  const handleSelect = (next) => {
    if (next === OTHER) {
      setOtherMode(true);
      setCustom("");
      return;
    }
    setOtherMode(false);
    setCustom("");
    onChange(next);
  };

  const applyCustom = async () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    await onAddOption?.(fieldKey, trimmed);
    onChange(trimmed);
    setOtherMode(false);
    setCustom("");
  };

  const cancelCustom = () => {
    setOtherMode(false);
    setCustom("");
  };

  return (
    <div className="wh-order-field-dropdown">
      <FormField
        id={id}
        label={label}
        as="select"
        value={selectValue}
        disabled={disabled}
        onChange={(e) => handleSelect(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {listValues.map((v) => (
          <option key={v} value={v}>
            {labelFor(v)}
          </option>
        ))}
        {showSavedCustom && <option value={value}>{labelFor(value)}</option>}
        <option value={OTHER}>Other (add new)…</option>
      </FormField>

      {otherMode && (
        <div className="wh-order-field-dropdown__other">
          <FormField
            id={`${id}-custom`}
            label="New value"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={disabled}
            placeholder={`Enter new ${fieldKey.replace(/_/g, " ")}`}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCustom();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelCustom();
              }
            }}
          />
          <div className="wh-order-field-dropdown__other-actions">
            <Button
              type="button"
              variant="secondary"
              className="wh-btn--sm"
              disabled={disabled || !custom.trim()}
              onClick={applyCustom}
            >
              Add &amp; use
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="wh-btn--sm"
              disabled={disabled}
              onClick={cancelCustom}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
