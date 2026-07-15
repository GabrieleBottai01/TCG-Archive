import { describe, it, expect } from 'vitest'
import { normalizeQuery, translateSealedQuery, queryTokens } from '@/lib/pricing/sealedGlossary'

describe('normalizeQuery', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeQuery("Collezione Allenatore Élite: Rivali!")).toBe('collezione allenatore elite rivali')
  })
  it('collapses whitespace', () => {
    expect(normalizeQuery('  primi   compagni  ')).toBe('primi compagni')
  })
})

describe('translateSealedQuery', () => {
  it('translates the user-reported case', () => {
    expect(translateSealedQuery("Primi compagni d'avventura")).toBe('first partner pack')
  })
  it('translates elite trainer box', () => {
    expect(translateSealedQuery('Collezione Allenatore Élite')).toBe('elite trainer box')
  })
  it('prefers the longest phrase match', () => {
    // "bundle buste" must not be split into "bundle" + "buste"
    expect(translateSealedQuery('Bundle Buste')).toBe('booster bundle')
  })
  it('leaves an already-English query untouched', () => {
    expect(translateSealedQuery('Elite Trainer Box')).toBe('elite trainer box')
  })
  it('keeps unknown words as-is', () => {
    expect(translateSealedQuery('Rivali Predestinati')).toBe('rivali predestinati')
  })
  it('does not match a glossary key that is only a prefix of a word', () => {
    // "mazzo" must not fire inside "mazzolino" — not a sealed product term
    expect(translateSealedQuery('Mazzolino di fiori')).toBe('mazzolino di fiori')
  })
  it('translates every occurrence of a repeated phrase, not just the first', () => {
    expect(translateSealedQuery('Buste Buste')).toBe('booster booster')
  })
  it('translates every occurrence of a repeated phrase across other words', () => {
    expect(translateSealedQuery('Scatola e Scatola')).toBe('box e box')
  })
})

describe('queryTokens', () => {
  it('drops stopwords and short tokens', () => {
    expect(queryTokens("Collezione Allenatore Elite di Rivali")).toEqual(['collezione', 'allenatore', 'elite', 'rivali'])
  })
})
