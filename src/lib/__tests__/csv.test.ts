import { it, expect } from 'vitest'
import { itemsToCsv } from '@/lib/csv'

const labels = {
  game: { POKEMON: 'Pokémon' },
  itemType: { RAW: 'Carta' },
  condition: { MINT: 'Mint' },
  headers: ['Nome', 'Gioco', 'Tipo', 'Cond.', 'Lingua', 'Set', 'Qta', 'Acquisto', 'Valore', 'Diff', 'Fonte'],
}

it('builds CSV with BOM, header, quoting and computed difference', () => {
  const csv = itemsToCsv(
    [{ name: 'Char, "rizard"', game: 'POKEMON', itemType: 'RAW', condition: 'MINT', language: 'IT', setName: 'Base', quantity: 2, purchasePrice: 5, marketValue: 8, marketValueSource: 'AUTO' }],
    labels,
  )
  const lines = csv.split('\r\n')
  expect(csv.startsWith('﻿')).toBe(true)
  expect(lines[0]).toBe('﻿Nome,Gioco,Tipo,Cond.,Lingua,Set,Qta,Acquisto,Valore,Diff,Fonte')
  expect(lines[1]).toBe('"Char, ""rizard""",Pokémon,Carta,Mint,IT,Base,2,5.00,8.00,6.00,AUTO')
})

it('handles null condition/language/set', () => {
  const csv = itemsToCsv(
    [{ name: 'X', game: 'POKEMON', itemType: 'RAW', condition: null, language: null, setName: null, quantity: 1, purchasePrice: 0, marketValue: 0, marketValueSource: null }],
    labels,
  )
  expect(csv.split('\r\n')[1]).toBe('X,Pokémon,Carta,,,,1,0.00,0.00,0.00,')
})
