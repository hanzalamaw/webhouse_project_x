const SKIP_REASON_MESSAGES = {
  no_store: "No Daraz store is connected. Connect Daraz in Integrations first.",
  not_linked: "This record is not linked to Daraz.",
  store_disconnected: "The Daraz store is disconnected.",
  unsupported_entity: "This record type cannot be synced to Daraz yet.",
  daraz_variant_not_found: "Could not match variants in Daraz.",
  variant_not_found: "Variant not found in ERP.",
  no_skus: "No Daraz SKUs found to update.",
};

export function formatDarazSyncError(detail, label = "record") {
  const text = String(detail || "").trim();
  if (!text) {
    return `Changes were not saved. Daraz did not accept the ${label.toLowerCase()} change.`;
  }
  if (/^changes were not saved/i.test(text)) return text;
  return `Changes were not saved. Daraz sync failed: ${text}`;
}

function darazFailureDetail(push, label) {
  if (push.skipped) {
    const reason = push.reason || "skipped";
    return SKIP_REASON_MESSAGES[reason] || `${label} could not be synced to Daraz (${reason}).`;
  }
  return push.error || push.warnings?.join("; ") || `Daraz did not accept the ${label.toLowerCase()} change.`;
}

export function requireDarazSync(push, label = "Record") {
  if (!push) {
    throw new Error(formatDarazSyncError(null, label));
  }
  if (push.skipped && push.reason !== "not_linked") {
    throw new Error(formatDarazSyncError(darazFailureDetail(push, label), label));
  }
  if (!push.skipped && !push.ok) {
    throw new Error(formatDarazSyncError(darazFailureDetail(push, label), label));
  }
  if (!push.skipped && push.warnings?.length) {
    throw new Error(formatDarazSyncError(push.warnings.join("; "), label));
  }
  return push;
}

export function requireDarazSyncIfLinked(push, label = "Record") {
  if (!push || (push.skipped && ["not_linked", "no_skus"].includes(push.reason))) return push;
  return requireDarazSync(push, label);
}
