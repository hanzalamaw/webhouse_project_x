import { useEffect, useState } from "react";

export const DEFAULT_CURRENCY = "PKR";
export const DEFAULT_TIMEZONE = "Asia/Karachi";

const CURRENCY_URL =
  "https://raw.githubusercontent.com/datasets/currency-codes/master/data/codes-all.csv";
const TIMEZONE_URL =
  "https://raw.githubusercontent.com/dmfilipenko/timezones.json/master/timezones.json";

const PAKISTAN_STANDARD_TIME = "Pakistan Standard Time";

const TIMEZONE_LABELS = {
  [DEFAULT_TIMEZONE]: PAKISTAN_STANDARD_TIME,
};

let currencyCache = null;
let timezoneCache = null;

function timezoneLabel(tz) {
  if (tz === DEFAULT_TIMEZONE) return PAKISTAN_STANDARD_TIME;
  return TIMEZONE_LABELS[tz] || tz.replace(/_/g, " ");
}

async function loadCurrencies() {
  if (currencyCache) return currencyCache;
  const res = await fetch(CURRENCY_URL);
  const text = await res.text();
  const lines = text.split("\n").slice(1);
  const codes = new Map();
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const code = parts[2]?.trim();
    const name = parts[1]?.trim();
    const withdrawn = parts[5]?.trim();
    if (!code || code === "Code" || withdrawn) continue;
    if (!codes.has(code)) codes.set(code, name || code);
  }
  currencyCache = [...codes.entries()]
    .map(([code, name]) => ({
      value: code,
      label: code === DEFAULT_CURRENCY ? `${code} — Pakistan Rupee` : `${code} — ${name}`,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return currencyCache;
}

async function loadTimezones() {
  if (timezoneCache) return timezoneCache;
  const res = await fetch(TIMEZONE_URL);
  const data = await res.json();
  const list = (Array.isArray(data) ? data : Object.values(data))
    .map((tz) => (typeof tz === "string" ? tz : tz.value || tz.text || ""))
    .filter(Boolean)
    .sort();
  timezoneCache = list.map((tz) => ({
    value: tz,
    label: timezoneLabel(tz),
  }));
  if (!timezoneCache.some((tz) => tz.value === DEFAULT_TIMEZONE)) {
    timezoneCache.unshift({
      value: DEFAULT_TIMEZONE,
      label: PAKISTAN_STANDARD_TIME,
    });
  } else {
    timezoneCache = timezoneCache.map((tz) =>
      tz.value === DEFAULT_TIMEZONE ? { ...tz, label: PAKISTAN_STANDARD_TIME } : tz
    );
  }
  const defaultIdx = timezoneCache.findIndex((tz) => tz.value === DEFAULT_TIMEZONE);
  if (defaultIdx > 0) {
    const [pakistan] = timezoneCache.splice(defaultIdx, 1);
    timezoneCache.unshift(pakistan);
  }
  return timezoneCache;
}

export function formatTimezoneDisplay(value) {
  if (!value) return "—";
  if (value === DEFAULT_TIMEZONE) return PAKISTAN_STANDARD_TIME;
  return TIMEZONE_LABELS[value] || value;
}

export function formatCurrencyDisplay(value, currencies = []) {
  if (!value) return "—";
  const hit = currencies.find((c) => c.value === value);
  return hit?.label || value;
}

export function useReferenceData() {
  const [currencies, setCurrencies] = useState([]);
  const [timezones, setTimezones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCurrencies(), loadTimezones()])
      .then(([c, t]) => {
        if (!cancelled) {
          setCurrencies(c);
          setTimezones(t);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrencies([{ value: DEFAULT_CURRENCY, label: "PKR — Pakistan Rupee" }]);
          setTimezones([
            { value: DEFAULT_TIMEZONE, label: PAKISTAN_STANDARD_TIME },
            { value: "UTC", label: "UTC" },
          ]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { currencies, timezones, loading };
}
