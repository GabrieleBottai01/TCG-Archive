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
    expect(translateSealedQuery("Primi compagni d'avventura")).toContain('first partner pack')
  })
  it('translates elite trainer box', () => {
    expect(translateSealedQuery('Collezione Allenatore Élite')).toContain('elite trainer box')
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
})

describe('queryTokens', () => {
  it('drops stopwords and short tokens', () => {
    expect(queryTokens("Collezione Allenatore Elite di Rivali")).toEqual(['collezione', 'allenatore', 'elite', 'rivali'])
  })
})
