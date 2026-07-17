import { describe, it, expect } from 'vitest'
import { estimateFromListings } from '@/lib/pricing/ebayEstimate'
import type { EbayListing, Marketplace } from '@/lib/observatory/ebay'

function listing(over: Partial<EbayListing> = {}): { listing: EbayListing; marketplace: Marketplace } {
  return {
    marketplace: 'EBAY_IT',
    listing: {
      ebayItemId: 'v1|1|0',
      title: 'Pokemon Destined Rivals Elite Trainer Box sigillata ITA',
      priceEur: 120,
      conditionId: '1000',
      buyingOptions: ['FIXED_PRICE'],
      sellerAccountType: 'INDIVIDUAL',
      ...over,
    },
  }
}

const etbIt = { name: 'Destined Rivals Elite Trainer Box', lang: 'IT' }

describe('estimateFromListings', () => {
  it('is the median of the matching sealed listings', () => {
    const r = estimateFromListings(
      [
        listing({ ebayItemId: 'a', priceEur: 100 }),
        listing({ ebayItemId: 'b', priceEur: 120 }),
        listing({ ebayItemId: 'c', priceEur: 140 }),
      ],
      etbIt.name,
      etbIt.lang,
    )
    expect(r).toEqual({ eur: 120, sampleSize: 3 })
  })

  it('drops what the structured gate rejects (used / auction) before taking the median', () => {
    const r = estimateFromListings(
      [
        listing({ ebayItemId: 'used', priceEur: 40, conditionId: '3000' }), // used — gate rejects
        listing({ ebayItemId: 'auction', priceEur: 30, buyingOptions: ['AUCTION'] }), // auction — gate rejects
        listing({ ebayItemId: 'ok1', priceEur: 100 }),
        listing({ ebayItemId: 'ok2', priceEur: 120 }),
      ],
      etbIt.name,
      etbIt.lang,
    )
    expect(r).toEqual({ eur: 110, sampleSize: 2 }) // only the two sealed fixed-price ones
  })

  it('drops what the title matcher rejects (wrong product / empty box)', () => {
    const r = estimateFromListings(
      [
        listing({ ebayItemId: 'other', title: 'Pokemon 151 Booster Bundle ITA', priceEur: 50 }),
        listing({ ebayItemId: 'empty', title: 'Destined Rivals Elite Trainer Box VUOTA', priceEur: 15 }),
        listing({ ebayItemId: 'ok', priceEur: 118 }),
      ],
      etbIt.name,
      etbIt.lang,
    )
    expect(r).toEqual({ eur: 118, sampleSize: 1 })
  })

  it('returns null with no matching listings', () => {
    expect(estimateFromListings([], etbIt.name, etbIt.lang)).toEqual({ eur: null, sampleSize: 0 })
  })
})
