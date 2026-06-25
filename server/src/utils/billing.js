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

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/** Next renewal from a period start (monthly = +1 month, yearly = +1 year). */
export function calcNextRenewalDate(startDate, cycle = "monthly") {
  const d = parseLocalDate(startDate);
  if (!d) return "";
  const next = cycle === "yearly" ? addYears(d, 1) : addMonths(d, 1);
  return formatLocalDate(next);
}

/** Roll start/renewal forward while today is past renewal_date. */
export function rollSubscriptionDates(startDate, renewalDate, cycle, asOf = new Date()) {
  let start = String(startDate || "").slice(0, 10);
  let renewal = String(renewalDate || "").slice(0, 10);
  const asOfStr = formatLocalDate(asOf instanceof Date ? asOf : parseLocalDate(asOf) || new Date());
  let rolled = false;

  while (renewal && asOfStr > renewal) {
    start = renewal;
    renewal = calcNextRenewalDate(start, cycle);
    rolled = true;
  }

  return { start_date: start, renewal_date: renewal, rolled };
}

export function billingMultiplier(cycle) {
  if (cycle === "yearly") return 12;
  return 1;
}

export function calcBillingTotal(monthlyPrice, cycle) {
  return Number((Number(monthlyPrice) * billingMultiplier(cycle)).toFixed(2));
}

/** One billing cycle charge (monthly = plan price, yearly = 12 × price). */
export function cycleChargeAmount(monthlyPrice, cycle) {
  return calcBillingTotal(monthlyPrice, cycle);
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

/** Elapsed billing cycles from anchor through asOf (inclusive of the active cycle). */
export function countElapsedCycles(anchorDate, asOfDate, cycle) {
  const anchor = parseLocalDate(anchorDate);
  const asOf = parseLocalDate(asOfDate);
  if (!anchor || !asOf) return 1;

  let cycles = 0;
  let boundary = new Date(anchor.getTime());
  const step = cycle === "yearly" ? (d) => addYears(d, 1) : (d) => addMonths(d, 1);

  while (boundary <= asOf) {
    cycles += 1;
    boundary = step(boundary);
  }

  return Math.max(1, cycles);
}

/** Current billing cycle window based on anchor anniversary. */
export function getCurrentCycleWindow(anchorDate, asOfDate, cycle) {
  const anchor = parseLocalDate(anchorDate);
  const asOf = parseLocalDate(asOfDate);
  if (!anchor || !asOf) {
    const today = formatLocalDate(new Date());
    return { cycle_start: today, cycle_end: today };
  }

  let cycleStart = new Date(anchor.getTime());
  if (cycle === "yearly") {
    while (addYears(cycleStart, 1) <= asOf) {
      cycleStart = addYears(cycleStart, 1);
    }
    return {
      cycle_start: formatLocalDate(cycleStart),
      cycle_end: formatLocalDate(addYears(cycleStart, 1)),
    };
  }

  while (addMonths(cycleStart, 1) <= asOf) {
    cycleStart = addMonths(cycleStart, 1);
  }
  return {
    cycle_start: formatLocalDate(cycleStart),
    cycle_end: formatLocalDate(addMonths(cycleStart, 1)),
  };
}

export function calcTotalBillingAmount(monthlyPrice, cycle, anchorDate, asOfDate) {
  const cycles = countElapsedCycles(anchorDate, asOfDate, cycle);
  return Number((cycleChargeAmount(monthlyPrice, cycle) * cycles).toFixed(2));
}

export function calcCurrentCycleAmount(monthlyPrice, cycle) {
  return cycleChargeAmount(monthlyPrice, cycle);
}

export function sumPaymentsInCycle(payments, cycleStart, cycleEnd) {
  const start = parseLocalDate(cycleStart);
  const end = parseLocalDate(cycleEnd);
  if (!start || !end) return 0;
  return payments.reduce((sum, p) => {
    const at = parseLocalDate(p.received_at);
    if (!at || at < start || at >= end) return sum;
    return sum + Number(p.total_received || 0);
  }, 0);
}

export function addPaymentReceived(bank, cash) {
  return Number((Number(bank || 0) + Number(cash || 0)).toFixed(2));
}

/** @deprecated use calcTotalBillingAmount */
export function resolveBillingPeriodEnd(startDate, renewalDate, asOf = new Date()) {
  const renewal = parseLocalDate(renewalDate);
  const asOfDate = asOf instanceof Date ? asOf : parseLocalDate(asOf);
  if (!asOfDate) {
    return renewal ? formatLocalDate(renewal) : String(renewalDate || "").slice(0, 10);
  }
  if (!renewal || asOfDate <= renewal) return formatLocalDate(asOfDate);
  return formatLocalDate(renewal);
}

/** @deprecated use calcTotalBillingAmount */
export function calcPeriodExpectedTotal(monthlyPrice, billingCycle, startDate, endDate) {
  const anchor = startDate;
  const asOf = resolveBillingPeriodEnd(startDate, endDate);
  return calcTotalBillingAmount(monthlyPrice, billingCycle, anchor, asOf);
}
