function parseLocalDate(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Plan price is monthly; multiply for billing period total. */
export function billingMultiplier(cycle) {
  if (cycle === "yearly") return 12;
  return 1;
}

export function calcBillingTotal(monthlyPrice, cycle) {
  return Number((Number(monthlyPrice) * billingMultiplier(cycle)).toFixed(2));
}

/** Renewal = same calendar date next year. */
export function calcRenewalDate(startDate) {
  const d = parseLocalDate(startDate);
  if (!d) return "";
  d.setFullYear(d.getFullYear() + 1);
  return formatLocalDate(d);
}

/** Fiscal year end = one day before the same date next year. */
export function calcFiscalYearEnd(startDate) {
  const d = parseLocalDate(startDate);
  if (!d) return "";
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
}

export function addPaymentReceived(bank, cash) {
  return Number((Number(bank || 0) + Number(cash || 0)).toFixed(2));
}
