function parseLocalDate(isoDate) {
  if (!isoDate) return null;
  const str = String(isoDate).slice(0, 10);
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
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

/** Expected subscription total for the period between start and end dates. */
export function calcPeriodExpectedTotal(monthlyPrice, billingCycle, startDate, endDate) {
  const price = Number(monthlyPrice) || 0;
  const months = monthsBetweenDates(startDate, endDate);
  if (billingCycle === "yearly") {
    const years = Math.max(1, Math.ceil(months / 12));
    return Number((calcBillingTotal(price, "yearly") * years).toFixed(2));
  }
  return Number((price * months).toFixed(2));
}

export function addPaymentReceived(bank, cash) {
  return Number((Number(bank || 0) + Number(cash || 0)).toFixed(2));
}
