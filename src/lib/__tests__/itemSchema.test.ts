import { it, expect } from 'vitest'
import { itemInputSchema } from '@/lib/itemSchema'

it('accepts a minimal valid item', () => {
  const r = itemInputSchema.safeParse({ game: 'POKEMON', itemType: 'RAW', name: 'Pikachu', quantity: 1, purchasePrice: 1, marketValue: 2 })
  expect(r.success).toBe(true)
})
it('rejects bad enum + negative qty', () => {
  expect(itemInputSchema.safeParse({ game: 'NOPE', itemType: 'RAW', name: 'x', quantity: -1, purchasePrice: 0, marketValue: 0 }).success).toBe(false)
})
it('requires a non-empty name', () => {
  expect(itemInputSchema.safeParse({ game: 'POKEMON', itemType: 'RAW', name: '', quantity: 1, purchasePrice: 0, marketValue: 0 }).success).toBe(false)
})
