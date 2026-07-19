import { describe, it, expect } from 'vitest'
import { priceSourceOf, isTcgcsvId, effectiveValue, type EuReference } from '@/lib/priceSource'

const base = { itemType: 'RAW', externalId: null, marketValue: 0, marketValueSource: null }

const sealedEstimate = {
  itemType: 'SEALED',
  externalId: 'tcgcsv:1:2',
  marketValue: 250, // the US estimate stored on the item
  marketValueSource: 'AUTO',
  language: 'IT',
}
const eu = (strength: EuReference['strength'], displayValue: number | null): EuReference => ({
  strength,
  displayValue,
  sampleSize: 12,
  sales: 3,
})

describe('isTcgcsvId', () => {
  it('recognises a sealed tcgcsv reference', () => {
    expect(isTcgcsvId('tcgcsv:24269:624676')).toBe(true)
  })
  it('rejects a TCGdex card id and null', () => {
    expect(isTcgcsvId('sv10-165')).toBe(false)
    expect(isTcgcsvId(null)).toBe(false)
  })
})

describe('priceSourceOf', () => {
  it('an AUTO raw card with a TCGdex id is a Cardmarket price', () => {
    expect(priceSourceOf({ ...base, externalId: 'sv10-165', marketValue: 1.5, marketValueSource: 'AUTO' }))
      .toEqual({ kind: 'cardmarket', langMismatch: false })
  })

  it('an AUTO sealed product with a tcgcsv id is an estimate', () => {
    expect(priceSourceOf({ ...base, itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 810, marketValueSource: 'AUTO', language: 'EN' }))
      .toEqual({ kind: 'estimate', langMismatch: false })
  })

  it('no longer flags a language mismatch — the sealed estimate is now the eBay EU median, not the US English product', () => {
    expect(priceSourceOf({ ...base, itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 810, marketValueSource: 'AUTO', language: 'IT' }).langMismatch).toBe(false)
    expect(priceSourceOf({ ...base, itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 810, marketValueSource: 'AUTO', language: 'JA' }).langMismatch).toBe(false)
  })

  it('a graded slab is never automatic, even with a card id', () => {
    expect(priceSourceOf({ ...base, itemType: 'GRADED', externalId: 'sv10-165', marketValue: 3500, marketValueSource: 'AUTO' }).kind)
      .toBe('manual')
  })

  it('a typed value is manual', () => {
    expect(priceSourceOf({ ...base, marketValue: 42, marketValueSource: 'MANUAL' }).kind).toBe('manual')
  })

  it('no automatic price and nothing typed is none', () => {
    expect(priceSourceOf({ ...base, marketValueSource: 'MANUAL' }).kind).toBe('none')
  })

  it('AUTO without an externalId cannot claim Cardmarket', () => {
    expect(priceSourceOf({ ...base, marketValue: 10, marketValueSource: 'AUTO' }).kind).toBe('manual')
  })
})

describe('priceSourceOf — the EU reference chip', () => {
  it('a STRONG reference outranks the US estimate as the chip source', () => {
    expect(priceSourceOf({ ...sealedEstimate, euReference: eu('STRONG', 95) }))
      .toEqual({ kind: 'euReference', langMismatch: false, strength: 'STRONG' })
  })
  it('a WEAK reference still shows its own chip (amber), not the estimate chip', () => {
    expect(priceSourceOf({ ...sealedEstimate, euReference: eu('WEAK', 95) }))
      .toEqual({ kind: 'euReference', langMismatch: false, strength: 'WEAK' })
  })
  it('NONE falls through to the eBay-EU-estimate chip', () => {
    expect(priceSourceOf({ ...sealedEstimate, euReference: eu('NONE', null) }))
      .toEqual({ kind: 'estimate', langMismatch: false })
  })
  it('a reference with no display value yet falls through to the estimate', () => {
    expect(priceSourceOf({ ...sealedEstimate, euReference: eu('WEAK', null) }).kind).toBe('estimate')
  })
  it('no reference at all is just the estimate', () => {
    expect(priceSourceOf({ ...sealedEstimate, euReference: null }).kind).toBe('estimate')
  })
})

describe('effectiveValue — only a STRONG reference is allowed to move the money', () => {
  it('STRONG substitutes the EU display value for the US estimate', () => {
    expect(effectiveValue({ ...sealedEstimate, euReference: eu('STRONG', 95) })).toBe(95)
  })
  it('WEAK does NOT substitute — a weak number moving the balance is the whole thing to avoid', () => {
    expect(effectiveValue({ ...sealedEstimate, euReference: eu('WEAK', 95) })).toBe(250)
  })
  it('NONE keeps the US estimate', () => {
    expect(effectiveValue({ ...sealedEstimate, euReference: eu('NONE', null) })).toBe(250)
  })
  it('a STRONG reference with a null display value cannot substitute', () => {
    expect(effectiveValue({ ...sealedEstimate, euReference: eu('STRONG', null) })).toBe(250)
  })
  it('a non-sealed item is never touched by an EU reference', () => {
    expect(effectiveValue({ ...base, marketValue: 5, euReference: eu('STRONG', 95) })).toBe(5)
  })
  it('no reference keeps the stored value', () => {
    expect(effectiveValue({ ...sealedEstimate })).toBe(250)
  })
})

const sealed = { itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 135, marketValueSource: 'AUTO', language: 'IT' as string | null }

describe('priceSourceOf — Cardtrader', () => {
  it('is cardtrader when autoPriceSource says so', () => {
    expect(priceSourceOf({ ...sealed, autoPriceSource: 'cardtrader' }).kind).toBe('cardtrader')
  })
  it('is the eBay estimate otherwise', () => {
    expect(priceSourceOf({ ...sealed, autoPriceSource: 'ebay' }).kind).toBe('estimate')
    expect(priceSourceOf({ ...sealed, autoPriceSource: null }).kind).toBe('estimate')
  })
})
