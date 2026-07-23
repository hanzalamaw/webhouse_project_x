import axios from "axios";
import { exchangeRateRepository } from "../repositories/exchangeRateRepository.js";

const BASE = "PKR";
const SOURCE = "fawazahmed0/currency-api";

/** Free daily-updated CDN rates (no API key). Fallback host if primary fails. */
const RATE_URLS = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/pkr.json",
  "https://latest.currency-api.pages.dev/v1/currencies/pkr.json",
];

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * Subscription display rounding after FX:
 * 1) half-up to a whole number (5+ up, 4- down)
 * 2) round that whole number UP to the nearest multiple of 5
 * Example: 200.7 → 201 → 205
 */
function roundSubscriptionDisplay(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  const whole = Math.round(x); // half-up for positive amounts
  return Math.ceil(whole / 5) * 5;
}

async function fetchPkrRatesFromNetwork() {
  let lastError;
  for (const url of RATE_URLS) {
    try {
      const { data } = await axios.get(url, { timeout: 20000 });
      const map = data?.pkr || data?.PKR;
      if (!map || typeof map !== "object") {
        throw new Error("Unexpected FX payload shape");
      }
      return {
        rates: map,
        rateDate: data.date || null,
        source: SOURCE,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Failed to fetch exchange rates");
}

export const exchangeRateService = {
  async refreshRates() {
    const { rates, rateDate, source } = await fetchPkrRatesFromNetwork();
    const rows = [];
    for (const [code, rate] of Object.entries(rates)) {
      const target = String(code).toUpperCase();
      const n = Number(rate);
      if (!Number.isFinite(n) || n <= 0) continue;
      // Skip exotic / non-ISO long codes for storage size
      if (target.length > 10) continue;
      rows.push({
        base_currency: BASE,
        target_currency: target,
        rate: n,
        rate_date: rateDate,
        source,
      });
    }
    // Always keep PKR identity
    rows.push({
      base_currency: BASE,
      target_currency: BASE,
      rate: 1,
      rate_date: rateDate,
      source: "identity",
    });
    const count = await exchangeRateRepository.upsertMany(rows);
    return { count, rateDate, source };
  },

  async getPkrToRate(targetCurrency) {
    const target = String(targetCurrency || BASE).toUpperCase();
    if (target === BASE) {
      return { rate: 1, rate_date: null, source: "identity", target_currency: BASE, base_currency: BASE };
    }
    let row = await exchangeRateRepository.getRate(BASE, target);
    if (!row) {
      try {
        await this.refreshRates();
        row = await exchangeRateRepository.getRate(BASE, target);
      } catch {
        /* leave null */
      }
    }
    if (!row) return null;
    return {
      rate: Number(row.rate),
      rate_date: row.rate_date,
      source: row.source,
      target_currency: target,
      base_currency: BASE,
    };
  },

  /** Convert a PKR amount into the tenant display currency. */
  async convertFromPkr(amountPkr, targetCurrency) {
    const target = String(targetCurrency || BASE).toUpperCase();
    const amount = Number(amountPkr);
    if (!Number.isFinite(amount)) {
      return { amount: 0, currency: target, rate: 1, rate_date: null, source: null };
    }
    if (target === BASE) {
      return { amount: roundMoney(amount), currency: BASE, rate: 1, rate_date: null, source: "identity" };
    }
    const fx = await this.getPkrToRate(target);
    if (!fx) {
      return {
        amount: roundMoney(amount),
        currency: BASE,
        rate: null,
        rate_date: null,
        source: null,
        fallback: true,
      };
    }
    return {
      amount: roundSubscriptionDisplay(amount * fx.rate),
      currency: target,
      rate: fx.rate,
      rate_date: fx.rate_date,
      source: fx.source,
    };
  },

  /** Convert PKR → target using rate, with subscription display rounding. */
  convertAmount(amountPkr, rate) {
    const amount = Number(amountPkr);
    const r = Number(rate);
    if (!Number.isFinite(amount)) return 0;
    if (!Number.isFinite(r) || r === 1) return roundMoney(amount);
    return roundSubscriptionDisplay(amount * r);
  },
};
