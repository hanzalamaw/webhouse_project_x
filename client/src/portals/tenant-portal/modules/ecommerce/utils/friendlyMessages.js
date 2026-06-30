export function friendlyConnectError(message) {
  const msg = String(message || "").toLowerCase();
  if (!msg) return "Something went wrong. Please try again.";
  if (msg.includes("expired") || msg.includes("invalid_state")) {
    return "Your connection session expired. Please try connecting again.";
  }
  if (msg.includes("not configured") || msg.includes("503")) {
    return "This integration is not available right now. Please contact your administrator.";
  }
  return "We could not complete the connection. Please try again.";
}

export const SYNC_STATUS_USER = {
  pending: "Waiting to sync",
  running: "Syncing your store…",
  completed: "Data fetched — review import",
  failed: "Sync interrupted",
};

export const ERP_IMPORT_STATUS_USER = {
  pending: "Not imported yet",
  in_progress: "Importing…",
  partial: "Partially imported",
  completed: "Imported to ERP",
};
