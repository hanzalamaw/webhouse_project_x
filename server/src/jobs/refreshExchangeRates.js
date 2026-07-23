import { exchangeRateService } from "../services/exchangeRateService.js";

/** Midnight (and startup) job: refresh PKR→world FX rates from a free public API. */
export async function refreshExchangeRatesJob() {
  const result = await exchangeRateService.refreshRates();
  console.log(
    `[fx] refreshed ${result.count} PKR rates (as of ${result.rateDate || "unknown"}) via ${result.source}`
  );
  return result;
}
