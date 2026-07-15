import { describe, it, expect } from 'vitest'
import { priceSourceOf, isTcgcsvId } from '@/lib/priceSource'

const base = { itemType: 'RAW', externalId: null, marketValue: 0, marketValueSource: null }

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

  it('flags a language mismatch: tcgcsv has no IT/JA sealed products, so the figure is the English one', () => {
    expect(priceSourceOf({ ...base, itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 810, marketValueSource: 'AUTO', language: 'IT' }).langMismatch).toBe(true)
    expect(priceSourceOf({ ...base, itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 810, marketValueSource: 'AUTO', language: 'JA' }).langMismatch).toBe(true)
  })

  it('treats a missing language on a sealed estimate as English rather than warning', () => {
    expect(priceSourceOf({ ...base, itemType: 'SEALED', externalId: 'tcgcsv:1:2', marketValue: 810, marketValueSource: 'AUTO', language: null }).langMismatch).toBe(false)
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
