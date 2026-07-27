import { describe, it, expect } from 'vitest'
import { cardmarketSealedEur, resolveCardmarketProductId, type CmProduct } from '@/lib/pricing/cardmarket'

// Real fixtures trimmed from products_nonsingles_6.json (2026-07-27).
const CAT: CmProduct[] = [
  { idProduct: 653700, name: 'Pokémon GO Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 },
  { idProduct: 653701, name: 'Pokémon GO Pokémon Center Elite Trainer Box Plus', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 },
  { idProduct: 690879, name: 'Pokémon GO 10 Elite Trainer Box Case', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5051 },
  { idProduct: 745548, name: 'Paldean Fates Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5546 },
  { idProduct: 745549, name: 'Paldean Fates Pokémon Center Elite Trainer Box', idCategory: 1016, categoryName: 'Pokémon Elite Trainer Boxes', idExpansion: 5546 },
  { idProduct: 745544, name: 'Paldean Fates Booster', idCategory: 52, categoryName: 'Pokémon Booster', idExpansion: 5546 },
]

describe('cardmarketSealedEur', () => {
  it('prefers trend, then avg, then low', () => {
    expect(cardmarketSealedEur({ trend: 103, avg: 114, low: 97 })).toBe(103)
    expect(cardmarketSealedEur({ trend: null, avg: 114, low: 97 })).toBe(114)
    expect(cardmarketSealedEur({ trend: null, avg: null, low: 97 })).toBe(97)
    expect(cardmarketSealedEur({ trend: null, avg: null, low: null })).toBeNull()
    expect(cardmarketSealedEur(undefined)).toBeNull()
  })
})

describe('resolveCardmarketProductId', () => {
  it('maps the plain ETB, not the Plus/Case siblings', () => {
    expect(resolveCardmarketProductId('Pokémon GO Elite Trainer Box', CAT)).toBe(653700)
  })
  it('picks the plain ETB over the Pokémon Center ETB in another set', () => {
    expect(resolveCardmarketProductId('Paldean Fates Elite Trainer Box', CAT)).toBe(745548)
  })
  it('honours the product type: a Booster query never returns an ETB', () => {
    expect(resolveCardmarketProductId('Paldean Fates Booster', CAT)).toBe(745544)
  })
  it('returns null when no set token overlaps (no confident match)', () => {
    expect(resolveCardmarketProductId('Surging Sparks Elite Trainer Box', CAT)).toBeNull()
  })
  it('returns null for an empty catalogue', () => {
    expect(resolveCardmarketProductId('Pokémon GO Elite Trainer Box', [])).toBeNull()
  })
})
