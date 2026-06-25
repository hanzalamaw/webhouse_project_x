function parseLocalDate(isoDate) {
  if (!isoDate) return null;
  const str = String(isoDate).slice(0, 10);
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Billing period end for accrued charges: today, capped at renewal. */
export function resolveBillingPeriodEnd(startDate, renewalDate, asOf = new Date()) {
  const renewal = parseLocalDate(renewalDate);
  const asOfDate = asOf instanceof Date ? asOf : parseLocalDate(asOf);
  if (!asOfDate) {
    return renewal ? formatLocalDate(renewal) : String(renewalDate || "").slice(0, 10);
  }
  if (!renewal || asOfDate <= renewal) return formatLocalDate(asOfDate);
  return formatLocalDate(renewal);
}

export function billingMultiplier(cycle) {
  if (cycle === "yearly") return 12;
  return 1;
}

export function calcBillingTotal(monthlyPrice, cycle) {
  return Number((Number(monthlyPrice) * billingMultiplier(cycle)).toFixed(2));
}

export function monthsBetweenDates(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return 1;
  if (end <= start) return 1;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(1, months);
}

/** Expected subscription total accrued from start through today (capped at renewal). */
export function calcPeriodExpectedTotal(monthlyPrice, billingCycle, startDate, endDate) {
  const price = Number(monthlyPrice) || 0;
  const periodEnd = resolveBillingPeriodEnd(startDate, endDate);
  const months = monthsBetweenDates(startDate, periodEnd);
  if (billingCycle === "yearly") {
    const years = Math.max(1, Math.ceil(months / 12));
    return Number((calcBillingTotal(price, "yearly") * years).toFixed(2));
  }
  return Number((price * months).toFixed(2));
}

export function addPaymentReceived(bank, cash) {
  return Number((Number(bank || 0) + Number(cash || 0)).toFixed(2));
}
