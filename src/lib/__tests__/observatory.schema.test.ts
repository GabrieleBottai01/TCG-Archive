import { describe, it, expect } from 'vitest'
import type { Prisma } from '@/generated/prisma/client'

// These tests pin the shape of the two Prisma models added for the EU price
// observatory (see docs/superpowers/specs/2026-07-15-eu-price-observatory-design.md,
// "Architettura"). They exercise only the generated types — no database
// access — so a schema drift (renamed/retyped/removed field, or a dropped
// unique/index constraint) fails `tsc --noEmit` or the assertions below,
// without needing a live Neon connection.

describe('EbayObservation schema', () => {
  it('accepts a create input with exactly the spec fields', () => {
    const input = {
      productKey: 'tcgcsv:23234:517001',
      ebayItemId: 'v1|123456789012|0',
      marketplace: 'EBAY_IT',
      lang: 'IT', // product language, never the marketplace's
      priceEur: 59.99,
      quantity: 3,
      firstSeenAt: new Date('2026-07-01T00:00:00Z'),
      lastSeenAt: new Date('2026-07-10T00:00:00Z'),
      goneAt: null,
      confidence: 0.8,
    } satisfies Prisma.EbayObservationUncheckedCreateInput

    expect(Object.keys(input).sort()).toEqual(
      [
        'productKey',
        'ebayItemId',
        'marketplace',
        'lang',
        'priceEur',
        'quantity',
        'firstSeenAt',
        'lastSeenAt',
        'goneAt',
        'confidence',
      ].sort()
    )
  })

  it('exposes the (ebayItemId, marketplace) compound unique used for upserts', () => {
    const where = {
      ebayItemId_marketplace: {
        ebayItemId: 'v1|123456789012|0',
        marketplace: 'EBAY_DE',
      },
    } satisfies Prisma.EbayObservationWhereUniqueInput

    expect(where.ebayItemId_marketplace).toEqual({
      ebayItemId: 'v1|123456789012|0',
      marketplace: 'EBAY_DE',
    })
  })

  it('allows quantity and goneAt to be omitted (nullable columns)', () => {
    const input = {
      productKey: 'tcgcsv:23234:517001',
      ebayItemId: 'v1|123456789012|0',
      marketplace: 'EBAY_IT',
      lang: 'EN',
      priceEur: 59.99,
      firstSeenAt: new Date('2026-07-01T00:00:00Z'),
      lastSeenAt: new Date('2026-07-10T00:00:00Z'),
      confidence: 0.5,
    } satisfies Prisma.EbayObservationUncheckedCreateInput

    expect(input.productKey).toBe('tcgcsv:23234:517001')
  })
})

describe('PriceReference schema', () => {
  it('accepts a create input with exactly the spec fields', () => {
    const input = {
      productKey: 'tcgcsv:23234:517001',
      lang: 'JA',
      day: new Date('2026-07-10'),
      medianEur: 59.99,
      sampleSize: 5,
      confirmedSales: 2,
      quickSales: 1,
      strength: 'STRONG',
    } satisfies Prisma.PriceReferenceUncheckedCreateInput

    expect(Object.keys(input).sort()).toEqual(
      [
        'productKey',
        'lang',
        'day',
        'medianEur',
        'sampleSize',
        'confirmedSales',
        'quickSales',
        'strength',
      ].sort()
    )
  })

  it('exposes the (productKey, lang, day) compound unique used for the daily roll-up', () => {
    const where = {
      productKey_lang_day: {
        productKey: 'tcgcsv:23234:517001',
        lang: 'IT',
        day: new Date('2026-07-10'),
      },
    } satisfies Prisma.PriceReferenceWhereUniqueInput

    expect(where.productKey_lang_day.lang).toBe('IT')
  })

  it('allows medianEur to be null (no reliable sample that day)', () => {
    const input = {
      productKey: 'tcgcsv:23234:517001',
      lang: 'IT',
      day: new Date('2026-07-10'),
      medianEur: null,
      sampleSize: 0,
      confirmedSales: 0,
      quickSales: 0,
      strength: 'NONE',
    } satisfies Prisma.PriceReferenceUncheckedCreateInput

    expect(input.medianEur).toBeNull()
  })
})
