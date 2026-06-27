import { FormField } from "../../../../../components/FormField";

export function TypeWithOtherField({
  id,
  label,
  preset,
  custom,
  onPresetChange,
  onCustomChange,
  options,
  optionLabels = {},
  disabled = false,
  customPlaceholder = "Enter custom type",
}) {
  return (
    <>
      <FormField
        id={id}
        label={label}
        as="select"
        value={preset}
        onChange={(e) => onPresetChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((key) => (
          <option key={key} value={key}>{optionLabels[key] || key}</option>
        ))}
      </FormField>
      {preset === "other" && (
        <FormField
          id={`${id}_custom`}
          label={`Custom ${label.toLowerCase()}`}
          value={custom}
          onChange={(e) => onCustomChange(e.target.value)}
          disabled={disabled}
          placeholder={customPlaceholder}
          required
        />
      )}
    </>
  );
}
