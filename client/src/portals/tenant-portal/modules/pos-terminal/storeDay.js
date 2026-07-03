/** Store business-day boundary (matches server posDrawer.js). */

function parseTimeParts(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] ?? 0);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** Most recent store-open moment at or before `now`. */
export function getLatestStoreResetAt(now, storeOpenTime) {
  const parts = parseTimeParts(storeOpenTime);
  if (!parts) return null;
  const reset = new Date(now);
  reset.setHours(parts.hours, parts.minutes, 0, 0);
  if (now < reset) {
    reset.setDate(reset.getDate() - 1);
  }
  return reset;
}

/** True when a new store day has started since the terminal session was connected. */
export function isTerminalStoreDayExpired(session, now = new Date()) {
  if (!session?.terminal_id) return false;
  const storeOpenTime = session.store_open_time;
  if (!storeOpenTime) return false;
  const connectedAt = session.connected_at;
  if (!connectedAt) return true;

  const connectedReset = getLatestStoreResetAt(new Date(connectedAt), storeOpenTime);
  const currentReset = getLatestStoreResetAt(now, storeOpenTime);
  if (!connectedReset || !currentReset) return false;
  return currentReset.getTime() > connectedReset.getTime();
}
