// Cardmarket sealed pricing from the public daily download files. No API key,
// no login: the price guide + product catalogue are public S3 JSON, updated
// daily. We map an English catalogue name to a Cardmarket idProduct, then read
// its trend price (avg, then low, as fallbacks). Read-only.

import { normalizeQuery, extractProductType } from './sealedGlossary'

export type CmProduct = {
  idProduct: number
  name: string
  idCategory: number
  categoryName: string
  idExpansion: number
}
export type CmPriceGuide = { avg: number | null; low: number | null; trend: number | null }

// The game name is in almost every product name within a single-game catalogue,
// so it does not discriminate between products — exclude it from set-token overlap.
const COMMON_TOKENS = new Set(['pokemon'])

// A confident match needs at least this score. Set-token overlap is weighted ×2,
// a product-type agreement adds 1, extra candidate tokens subtract 1. Tuned
// against the live-check set (Task 6): the plain product beats its siblings by a
// wide margin, and an unowned set scores 0 (no set-token overlap) → null.
const MIN_SCORE = 2

/** trend, else avg, else low, else null. */
export function cardmarketSealedEur(pg: CmPriceGuide | undefined): number | null {
  if (!pg) return null
  return pg.trend ?? pg.avg ?? pg.low ?? null
}

/**
 * Pure: map an English catalogue name (e.g. "Paldean Fates Elite Trainer Box")
 * to a Cardmarket idProduct by scanning the product catalogue. Product type is a
 * hard filter when present (ETB ≠ Booster). A candidate must share at least one
 * SET token (name tokens minus the product-type phrase, minus the game name), so
 * a match on "elite trainer box" alone can never carry across sets. Score =
 * setOverlap×2 + (typeKnown ? 1 : 0) − extraTokens; best ≥ MIN_SCORE wins, else null.
 */
export function resolveCardmarketProductId(englishName: string, catalogue: CmProduct[]): number | null {
  const nameNorm = normalizeQuery(englishName)
  if (!nameNorm) return null
  const { productTypes } = extractProductType(nameNorm)
  const nameTokens = new Set(nameNorm.split(' ').filter(Boolean))
  const setTokens = new Set(
    [...nameTokens].filter((t) => !COMMON_TOKENS.has(t) && !productTypes.some((pt) => pt.split(' ').includes(t))),
  )
  if (setTokens.size === 0) return null // nothing distinctive to anchor on

  let bestId: number | null = null
  let bestScore = -Infinity
  for (const p of catalogue) {
    const pn = normalizeQuery(p.name)
    if (productTypes.length > 0 && !productTypes.some((t) => pn.includes(t))) continue
    const pTokens = pn.split(' ').filter(Boolean)
    const pTokenSet = new Set(pTokens)
    const setOverlap = [...setTokens].filter((t) => pTokenSet.has(t)).length
    if (setOverlap === 0) continue // must share a set token, not just the product type
    const extra = pTokens.filter((t) => !nameTokens.has(t)).length
    const score = setOverlap * 2 + (productTypes.length > 0 ? 1 : 0) - extra
    if (score > bestScore) { bestScore = score; bestId = p.idProduct }
  }
  return bestScore >= MIN_SCORE ? bestId : null
}
