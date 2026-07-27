import type { PriceInput, PriceResult } from './types'
import { cardtraderEnabled, resolveBlueprintId, getMarketplace, lowestSealedEur } from './cardtrader'
import { cardmarketEnabled, cardmarketPriceFor } from './cardmarket'
import { liveEbayEstimate } from './ebayEstimate'

const CT_LANG: Record<string, string> = { IT: 'it', EN: 'en', JA: 'jp' }

// Sealed pricing: Cardtrader → Cardmarket → eBay. Cardtrader gives a robust low
// EUR marketplace price for products it maps; Cardmarket's public price guide
// (trend) covers the products Cardtrader can't map; eBay's asking-median is the
// last resort. The eBay observatory is informational only — never the value.
export async function sealedPrice(i: PriceInput): Promise<PriceResult | null> {
  const language = i.language ?? 'IT'
  let blueprintId: number | null = i.cardtraderBlueprintId ?? null
  let cardmarketProductId: number | null = i.cardmarketProductId ?? null

  // 1) Cardtrader — the primary EU marketplace price.
  try {
    if (cardtraderEnabled() && i.name) {
      if (blueprintId == null) blueprintId = await resolveBlueprintId(i.name)
      if (blueprintId != null) {
        const products = await getMarketplace(blueprintId, { language: CT_LANG[language] ?? 'it' })
        const { eur } = lowestSealedEur(products, CT_LANG[language] ?? 'it')
        if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardtrader', cardtraderBlueprintId: blueprintId, cardmarketProductId }
      }
    }
  } catch {
    // Cardtrader unreachable / rate-limited — fall through.
  }

  // 2) Cardmarket — the public daily price guide, for products Cardtrader can't map.
  try {
    if (cardmarketEnabled() && i.name) {
      const { eur, productId } = await cardmarketPriceFor(i.name, cardmarketProductId)
      if (productId != null) cardmarketProductId = productId
      if (eur != null) return { value: eur, source: 'AUTO', origin: 'cardmarket', cardtraderBlueprintId: blueprintId, cardmarketProductId }
    }
  } catch {
    // Cardmarket file unreachable — fall through to eBay.
  }

  // 3) Fallback: the live eBay EU median, searched with the Italian term (priceQuery).
  const query = i.priceQuery ?? i.name
  if (query && query.trim()) {
    const est = await liveEbayEstimate(query, language)
    if (est.eur != null) return { value: est.eur, source: 'AUTO', origin: 'ebay', cardtraderBlueprintId: blueprintId, cardmarketProductId }
  }
  return null
}
