import { it, expect } from 'vitest'
import { formatEUR } from '@/lib/format'

it('formats EUR with 2 decimals, comma separator', () => {
  expect(formatEUR(8)).toBe('€ 8,00')
  expect(formatEUR(-5.5)).toBe('-€ 5,50')
})
