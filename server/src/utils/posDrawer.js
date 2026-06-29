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

/**
 * Opening drawer balance when starting a new register shift.
 * Carries yesterday's closing balance; uses store opening_balance when no prior shift exists.
 */
export function resolveOpeningBalance({
  now = new Date(),
  storeOpenTime,
  lastClosedRegister,
  defaultOpeningBalance = 0,
}) {
  const resetAt = getLatestStoreResetAt(now, storeOpenTime);

  if (!lastClosedRegister) {
    return {
      openingBalance: Number(defaultOpeningBalance) || 0,
      resetApplied: false,
      resetAt,
    };
  }

  const closingBalance = Number(lastClosedRegister.closing_balance) || 0;
  return { openingBalance: closingBalance, resetApplied: false, resetAt };
}

export function formatTime12(timeStr) {
  const parts = parseTimeParts(timeStr);
  if (!parts) return null;
  const d = new Date(2000, 0, 1, parts.hours, parts.minutes);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
