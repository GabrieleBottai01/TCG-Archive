// Live USD→EUR rate for converting tcgcsv (TCGplayer, USD) sealed prices.
// A hardcoded rate silently drifts: 0.92 was ~5% off the real 0.877 by 2026-07.
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'
const TTL_MS = 24 * 60 * 60 * 1000

// Used when the FX API is unreachable. Refresh occasionally; it only bounds the error.
export const FALLBACK_USD_EUR = 0.877

let cache: { rate: number; ts: number } | null = null

/** Test-only: clear the module-scope cache between cases. */
export function __resetFxCache(): void {
  cache = null
}

export async function getUsdToEurRate(): Promise<number> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.rate
  try {
    const res = await fetch(FX_URL)
    if (!res.ok) return FALLBACK_USD_EUR
    const json = (await res.json()) as { rates?: { EUR?: number } }
    const rate = json?.rates?.EUR
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return FALLBACK_USD_EUR
    cache = { rate, ts: Date.now() }
    return rate
  } catch {
    return FALLBACK_USD_EUR
  }
}
