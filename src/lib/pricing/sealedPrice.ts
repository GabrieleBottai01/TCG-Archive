import type { PriceInput, PriceResult } from './types'
import { cardtraderEnabled, resolveBlueprintId, getMarketplace, lowestSealedEur } from './cardtrader'
import { liveEbayEstimate } from './ebayEstimate'

const CT_LANG: Record<string, string> = { IT: 'it', EN: 'en', JA: 'jp' }

// Sealed pricing, Cardtrader-first. Cardtrader gives a robust low EUR marketplace
// price (native EUR, product-level); eBay's asking-median is the fallback. The
// eBay observatory is informational only — it never overrides this value.
export async function sealedPrice(i: PriceInput): Promise<PriceResult | null> {
  const language = i.language ?? 'IT'
  let blueprintId: number | null = i.cardtraderBlueprintId ?? null

  try {
    if (cardtraderEnabled() && i.name) {
      if (blueprintId == null) blueprintId = await resolveBlueprintId(i.name)
      if (blueprintId != null) {
        const products = await getMarketplace(blueprintId, { language: CT_LANG[language] ?? 'it' })
        const { eur } = lowestSealedEur(products, CT_LANG[language] ?? 'it')
        if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: blueprintId }
      }
    }
  } catch {
    // Cardtrader unreachable / rate-limited — fall through to eBay.
  }

  // Fallback: the live eBay EU median, searched with the Italian term (priceQuery).
  const query = i.priceQuery ?? i.name
  if (query && query.trim()) {
    const est = await liveEbayEstimate(query, language)
    if (est.eur != null) return { value: est.eur, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: blueprintId }
  }
  return null
}
