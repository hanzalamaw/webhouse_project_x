import { ADDRESS_TYPE_LABELS, CUSTOMER_TYPE_LABELS } from "../constants";

export function formatAddressType(value) {
  const legacy = { billing: "Default", shipping: "Office" };
  if (legacy[value]) return legacy[value];
  if (ADDRESS_TYPE_LABELS[value]) return ADDRESS_TYPE_LABELS[value];
  return value || "—";
}

export function formatCustomerType(value) {
  if (CUSTOMER_TYPE_LABELS[value]) return CUSTOMER_TYPE_LABELS[value];
  return value || "—";
}

/** Split stored DB value into select + optional custom text for "other". */
export function splitPresetOrOther(stored, presets) {
  const known = presets.filter((p) => p !== "other");
  if (stored && known.includes(stored)) {
    return { preset: stored, custom: "" };
  }
  if (!stored) {
    return { preset: known[0] || "other", custom: "" };
  }
  return { preset: "other", custom: stored };
}

/** Resolve select + custom field to API value. */
export function resolvePresetOrOther(preset, custom, label) {
  if (preset === "other") {
    const value = String(custom || "").trim();
    if (!value) throw new Error(`${label} is required when Other is selected`);
    if (value.length > 45) throw new Error(`${label} must be 45 characters or less`);
    return value;
  }
  return preset;
}

export function isDefaultAddressType(addressType) {
  return addressType === "default";
}
