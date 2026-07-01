import { useEffect, useId, useState } from "react";
import { FormField } from "./FormField";
import { Button } from "./Button";

const OTHER = "__other__";
/** Preset values hidden from the list — use "Other (add new)…" instead */
const HIDDEN_PRESETS = new Set(["other"]);

function defaultLabel(value) {
  return String(value).replace(/_/g, " ");
}

/**
 * Native &lt;select&gt; for order field options, with "Other…" to add a tenant-wide custom value.
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
  const isOtherMode = value === OTHER || (value && !valueInList);

  const [preset, setPreset] = useState(() => {
    if (!value) return "";
    if (valueInList) return value;
    return OTHER;
  });
  const [custom, setCustom] = useState(() => (value && !valueInList ? value : ""));

  useEffect(() => {
    if (!value) {
      setPreset("");
      setCustom("");
      return;
    }
    if (listValues.includes(value)) {
      setPreset(value);
      setCustom("");
    } else {
      setPreset(OTHER);
      setCustom(value);
    }
  }, [value, listValues]);

  const applyCustom = async () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    await onAddOption?.(fieldKey, trimmed);
    onChange(trimmed);
    setPreset(trimmed);
    setCustom("");
  };

  return (
    <div className="wh-order-field-dropdown">
      <FormField
        id={id}
        label={label}
        as="select"
        value={preset}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setPreset(next);
          if (next === OTHER) {
            onChange("");
            return;
          }
          if (next === "") {
            onChange("");
            return;
          }
          onChange(next);
          setCustom("");
        }}
      >
        <option value="">{emptyLabel}</option>
        {listValues.map((v) => (
          <option key={v} value={v}>
            {labelFor(v)}
          </option>
        ))}
        <option value={OTHER}>Other (add new)…</option>
        {isOtherMode && value && !listValues.includes(value) && value !== "other" && (
          <option value={value}>{labelFor(value)}</option>
        )}
      </FormField>

      {preset === OTHER && (
        <div className="wh-order-field-dropdown__other">
          <FormField
            id={`${id}-custom`}
            label="New value"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={disabled}
            placeholder={`Enter new ${fieldKey.replace(/_/g, " ")}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCustom();
              }
            }}
          />
          <Button type="button" variant="secondary" className="wh-btn--sm" disabled={disabled || !custom.trim()} onClick={applyCustom}>
            Add & use
          </Button>
        </div>
      )}
    </div>
  );
}
