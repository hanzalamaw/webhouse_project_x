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

export const FISCAL_REFERENCE_YEAR = 2000;
export const DEFAULT_FISCAL_START_MONTH = 1;
export const DEFAULT_FISCAL_START_DAY = 1;
export const DEFAULT_FISCAL_END_MONTH = 12;
export const DEFAULT_FISCAL_END_DAY = 31;

/** Plan price is monthly; multiply for billing period total. */
export function billingMultiplier(cycle) {
  if (cycle === "yearly") return 12;
  return 1;
}

export function calcBillingTotal(monthlyPrice, cycle) {
  return Number((Number(monthlyPrice) * billingMultiplier(cycle)).toFixed(2));
}

/** Monthly = same day next month; yearly = same date next year. */
export function calcRenewalDate(startDate, cycle = "monthly") {
  const d = parseLocalDate(startDate);
  if (!d) return "";
  if (cycle === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return formatLocalDate(d);
}

export function fiscalToStorage(month, day) {
  return `${FISCAL_REFERENCE_YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function fiscalFromStorage(dateStr) {
  if (!dateStr) {
    return { month: DEFAULT_FISCAL_START_MONTH, day: DEFAULT_FISCAL_START_DAY };
  }
  const d = parseLocalDate(String(dateStr).slice(0, 10));
  if (!d) return { month: DEFAULT_FISCAL_START_MONTH, day: DEFAULT_FISCAL_START_DAY };
  return { month: d.getMonth() + 1, day: d.getDate() };
}

export function formatFiscalDisplay(dateStr) {
  const { month, day } = fiscalFromStorage(dateStr);
  return new Date(FISCAL_REFERENCE_YEAR, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Fiscal year end = one day before the same month/day next year. */
export function calcFiscalYearEnd(startDate) {
  const { month, day } = fiscalFromStorage(startDate);
  let endMonth = month;
  let endDay = day - 1;
  if (endDay < 1) {
    endMonth = month === 1 ? 12 : month - 1;
    endDay = new Date(FISCAL_REFERENCE_YEAR, endMonth, 0).getDate();
  }
  return fiscalToStorage(endMonth, endDay);
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

function countElapsedCycles(anchorDate, asOfDate, cycle) {
  const anchor = parseLocalDate(anchorDate);
  const asOf = parseLocalDate(asOfDate);
  if (!anchor || !asOf) return 1;

  let cycles = 0;
  let boundary = new Date(anchor.getTime());

  while (boundary <= asOf) {
    cycles += 1;
    if (cycle === "yearly") {
      boundary.setFullYear(boundary.getFullYear() + 1);
    } else {
      boundary.setMonth(boundary.getMonth() + 1);
    }
  }

  return Math.max(1, cycles);
}

export function resolveBillingPeriodEnd(startDate, renewalDate, asOf = new Date()) {
  const renewal = parseLocalDate(renewalDate);
  const asOfDate = asOf instanceof Date ? asOf : parseLocalDate(asOf);
  if (!asOfDate) {
    return renewal ? formatLocalDate(renewal) : String(renewalDate || "").slice(0, 10);
  }
  if (!renewal || asOfDate <= renewal) return formatLocalDate(asOfDate);
  return formatLocalDate(renewal);
}

/** Expected lifetime billing total from anchor through today. */
export function calcPeriodExpectedTotal(monthlyPrice, billingCycle, startDate, endDate) {
  const anchor = startDate;
  const today = formatLocalDate(new Date());
  const asOf = resolveBillingPeriodEnd(startDate, endDate, parseLocalDate(today) || new Date());
  const cycles = countElapsedCycles(anchor, asOf, billingCycle);
  return Number((calcBillingTotal(monthlyPrice, billingCycle) * cycles).toFixed(2));
}

export function addPaymentReceived(bank, cash) {
  return Number((Number(bank || 0) + Number(cash || 0)).toFixed(2));
}

export function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}
