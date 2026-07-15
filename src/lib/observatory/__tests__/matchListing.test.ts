import { describe, it, expect } from 'vitest'
import { matchListing } from '@/lib/observatory/matchListing'

const etbEn = { name: 'Destined Rivals Elite Trainer Box', lang: 'EN' }
const etbIt = { name: 'Destined Rivals Elite Trainer Box', lang: 'IT' }

describe('exclusions — these are what keep the median honest', () => {
  it('rejects an EMPTY box, which would otherwise say an ETB is worth 15 euro', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box VUOTA scatola da collezione', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('empty')
  })
  it('rejects the Pokemon Center exclusive, a different product at up to 3x', () => {
    expect(matchListing('Destined Rivals Pokemon Center Elite Trainer Box', etbEn, 'EBAY_IT').ok).toBe(false)
  })
  it('rejects a multi-item lot, whose price is not per unit', () => {
    expect(matchListing('LOTTO 3x Destined Rivals Elite Trainer Box', etbIt, 'EBAY_IT').ok).toBe(false)
  })
})

describe('product language is not the marketplace language', () => {
  it('accepts an Italian product on the Italian site with no marker', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(true)
    expect(r.lang).toBe('IT')
  })
  it('rejects an unmarked listing on the German site: no marker there means German', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box neu original verpackt', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(false)
    expect(r.lang).toBe('DE')
  })
  it('accepts an explicitly English product on the German site — this is why .de adds volume', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box ENGLISCH neu', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(true)
    expect(r.lang).toBe('EN')
  })
  it('rejects an explicitly German product even on the Italian site', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box DEUTSCH', etbEn, 'EBAY_IT').ok).toBe(false)
  })
  it('rejects an English product when the item owned is Italian', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ENG sealed', etbIt, 'EBAY_IT').ok).toBe(false)
  })
})

describe('an Italian query still has to find the English product name', () => {
  // The glossary translates the product TYPE ("collezione allenatore elite" ->
  // "elite trainer box") on both sides. It deliberately does not translate SET
  // names — TCGdex already supplies those localized. So a product whose set name
  // an Italian listing writes in Italian must be passed in with its Italian
  // name; the glossary bridges the type vocabulary, which is its whole job.
  const etbItLocalized = { name: 'Collezione Allenatore Elite Rivali Predestinati', lang: 'IT' }

  it('accepts the Italian phrasing via the glossary', () => {
    const r = matchListing('Pokemon Collezione Allenatore Elite Rivali Predestinati ITA', etbItLocalized, 'EBAY_IT')
    expect(r.ok).toBe(true)
  })

  it('still accepts an Italian listing that leaves the set name in English', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ITA sigillata', etbIt, 'EBAY_IT').ok).toBe(true)
  })
})

describe('unrelated titles', () => {
  it('rejects a different product', () => {
    expect(matchListing('Pokemon 151 Booster Bundle ITA', etbIt, 'EBAY_IT').ok).toBe(false)
  })

  // The set name is the only thing separating two products that cost very
  // different amounts. Relaxing the name check to make an Italian set name match
  // an English one would open exactly this hole, so it is pinned shut here.
  it('rejects the SAME product type from a DIFFERENT set', () => {
    const r = matchListing('Pokemon 151 Elite Trainer Box ITA sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('destined')
  })
})

describe('adversarial titles — the ones most likely to be wrong in the wild', () => {
  it('rejects a two-product bundle priced as one, with no "lotto" anywhere', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box + Booster Bundle ITA', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('bundle')
  })
  it('rejects a quantity multiplier with no "lotto" anywhere', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ITA 2x sigillate', etbIt, 'EBAY_IT').ok).toBe(false)
  })
  it('rejects an empty box that says "solo box" rather than "vuota"', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ITA solo box senza buste', etbIt, 'EBAY_IT').ok).toBe(false)
  })
  it('rejects a German empty box on the German site ("leere")', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ENGLISCH leere Box', etbEn, 'EBAY_DE').ok).toBe(false)
  })
  it('rejects a title claiming two languages at once', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box ITA / ENG sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('ambiguous')
  })
  it('handles accents and Pokémon Center via the shared normaliser', () => {
    expect(matchListing('Pokémon Center Destined Rivals Élite Trainer Box ENG', etbEn, 'EBAY_IT').ok).toBe(false)
  })

  // Found by running realistic titles through the matcher: all three of these
  // were false accepts, which are the only kind of bug that matters here.
  it('rejects an OPENED box, which is a different price', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box ITA APERTA completa di tutto', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('opened')
  })
  it('rejects the promo card and sleeves pulled OUT of the box, worth a couple of euro', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box Promo Card + Sleeves ENG', etbEn, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('parts')
  })
  it('rejects a preorder, whose price is a future price', () => {
    expect(matchListing('PREORDER Pokemon Destined Rivals Elite Trainer Box ITA uscita 30/05', etbIt, 'EBAY_IT').ok).toBe(false)
  })

  // ...and the negations those exclusions must not eat.
  it('still accepts "MAI APERTA", the commonest Italian way to say sealed', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ITA MAI APERTA sigillata', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still accepts German "ungeöffnet" and "nicht geöffnet"', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ENGLISCH OVP ungeöffnet', etbEn, 'EBAY_DE').ok).toBe(true)
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ENGLISCH nicht geöffnet', etbEn, 'EBAY_DE').ok).toBe(true)
  })
  it('still accepts "IN STOCK", which means in hand, not a job lot', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box - IN STOCK - Pronta Consegna ITA', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still rejects a bare "STOCK 10", which is a job lot', () => {
    expect(matchListing('STOCK 10 Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT').ok).toBe(false)
  })
  it('still accepts a full ETB that advertises its own promo card', () => {
    expect(matchListing('Pokemon Destined Rivals Elite Trainer Box ENG Promo Card inclusa', etbEn, 'EBAY_IT').ok).toBe(true)
  })
  it('does not mistake the Italian word "scatola" for a second product', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box ITA scatola sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(true)
  })
})

describe('confidence is legible', () => {
  it('scores an explicitly-marked clean title above an unmarked noisy one', () => {
    const explicit = matchListing('Destined Rivals Elite Trainer Box ITA', etbIt, 'EBAY_IT')
    const inferred = matchListing('Pokemon Destined Rivals Elite Trainer Box sigillata nuova perfetta', etbIt, 'EBAY_IT')
    expect(explicit.ok && inferred.ok).toBe(true)
    expect(explicit.confidence).toBeGreaterThan(inferred.confidence)
    expect(explicit.confidence).toBeLessThanOrEqual(1)
    expect(inferred.confidence).toBeGreaterThan(0)
  })
  it('gives every rejection a confidence of 0 and a reason naming the rule', () => {
    const r = matchListing('LOTTO 3x Destined Rivals Elite Trainer Box', etbIt, 'EBAY_IT')
    expect(r.confidence).toBe(0)
    expect(r.reason).toContain('lot')
  })
})
