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
  // These two were one test that asserted only `ok === false` on a title carrying
  // BOTH triggers. Exclusions short-circuit, so it passed no matter what the
  // normaliser did with the accents — it could not fail on the thing it was named
  // for. Split so the accent half has to actually ACCEPT.
  it('sees through accents via the shared normaliser: "Élite" is still elite', () => {
    const r = matchListing('Destined Rivals Élite Trainer Box ENG', etbEn, 'EBAY_IT')
    expect(r.ok).toBe(true)
    expect(r.lang).toBe('EN')
  })
  it('rejects the Pokémon Center exclusive even when written with its accent', () => {
    const r = matchListing('Pokémon Center Destined Rivals Elite Trainer Box ENG', etbEn, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('exclusive')
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

// Every title below was a FALSE ACCEPT found by running adversarial titles
// through the matcher. Each asserts the rejection *and* the rule that fired,
// because a rejection for the wrong reason is a rule that is not really there.
describe('multi-unit lots — "3x" is only one of the ways N gets written', () => {
  // This one scored 0.97 — the highest confidence in the whole review — because
  // a lot has a short, tidy title. See the note on `confidence` in matchListing.
  it('rejects a bare leading count ("3 Elite Trainer Box ...")', () => {
    const r = matchListing('3 Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })
  it('rejects a bare leading count before the brand ("2 Pokemon ...")', () => {
    const r = matchListing('2 Pokemon Destined Rivals Elite Trainer Box ITA', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })
  it('rejects "coppia"', () => {
    const r = matchListing('Coppia Elite Trainer Box Destined Rivals ITA sigillate', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })
  it('rejects "set di 2"', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA set di 2', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })
  it('rejects "doppia confezione"', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA doppia confezione sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })
  it('rejects a count bound to a quantity noun ("3 pezzi")', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA 3 pezzi', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })
  it('rejects the German quantity noun ("2 Stück")', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals Englisch 2 Stück', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('multi-unit')
  })

  // ...and the numbers that are NOT quantities. A set name, a year and a card
  // count all live in titles; reading them as lot sizes would delete honest
  // listings for nothing.
  it('does not read a trailing set number as a quantity ("... Elite Trainer Box 151")', () => {
    expect(matchListing('Destined Rivals Elite Trainer Box 151', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('does not read a leading set number as a quantity', () => {
    expect(matchListing('151 Destined Rivals Elite Trainer Box ITA', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still accepts "1x", which is one unit', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals ITA 1x sigillata', etbIt, 'EBAY_IT').ok).toBe(true)
  })
})

describe('the listing must be a real, sealed, in-hand unit for sale', () => {
  it('rejects an Italian wanted ad ("CERCO") — a lowball offer that drags the median DOWN', () => {
    const r = matchListing('CERCO Elite Trainer Box Destined Rivals ITA sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('wanted')
  })
  it('rejects an Italian wanted ad ("COMPRO")', () => {
    const r = matchListing('COMPRO Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('wanted')
  })
  it('rejects a German wanted ad ("Suche")', () => {
    const r = matchListing('Suche Elite Trainer Box Destined Rivals Englisch', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('wanted')
  })
  it('rejects a used unit', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA usata ottime condizioni', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('used')
  })
  it('rejects an explicitly unsealed unit ("senza sigilli")', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA senza sigilli', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('used')
  })
  it('rejects a postage-only listing, whose price is the shipping', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA - SOLO SPEDIZIONE', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('postage')
  })
  it('rejects a deposit — the preorder trap wearing the word "acconto"', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA acconto prenota ora', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('preorder')
  })
  it('rejects the "oe" transliteration of geöffnet', () => {
    const r = matchListing('Pokemon Destined Rivals Elite Trainer Box Englisch geoeffnet', etbEn, 'EBAY_DE')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('opened')
  })

  // The negations are load-bearing: "mai aperta" / "nicht geöffnet" is how an
  // Italian or German seller says SEALED. A rule that eats them deletes most of
  // the honest sample, so each one is pinned individually.
  it('still accepts "mai aperta"', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals ITA MAI APERTA', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still accepts "non aperta"', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals ITA non aperta sigillata', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still accepts "mai usata"', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals ITA mai usata sigillata', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still accepts "nicht geöffnet" and its "oe" transliteration', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals Englisch nicht geöffnet', etbEn, 'EBAY_DE').ok).toBe(true)
    expect(matchListing('Elite Trainer Box Destined Rivals Englisch nicht geoeffnet', etbEn, 'EBAY_DE').ok).toBe(true)
  })
  it('still accepts "ungeöffnet" and "ungeoeffnet", which need no negator', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals Englisch OVP ungeöffnet', etbEn, 'EBAY_DE').ok).toBe(true)
    expect(matchListing('Elite Trainer Box Destined Rivals Englisch OVP ungeoeffnet', etbEn, 'EBAY_DE').ok).toBe(true)
  })
})

describe('a second unit of the SAME type is still a lot', () => {
  // A set-membership test filtered "elite trainer box" out as "the product
  // already has that type", so ETB + ETB read as one ETB. Occurrences, not
  // membership.
  it('rejects ETB + a second ETB from another set', () => {
    const r = matchListing(
      'Pokemon Destined Rivals Elite Trainer Box ITA + Elite Trainer Box Pokemon 151 ITA',
      etbIt,
      'EBAY_IT'
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('bundle')
  })
})

describe('shipping origin is not product language', () => {
  // False rejects, so safe — but `reason` said "the title claims IT and DE",
  // which is confidently wrong, and `reason` is the debugging surface.
  it('accepts an Italian box shipped from Germany', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals ITA spedizione da Germania', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(true)
    expect(r.lang).toBe('IT')
  })
  it('does not read the preposition in "de luxe" as a German marker', () => {
    expect(matchListing('Elite Trainer Box Destined Rivals ITA edizione de luxe', etbIt, 'EBAY_IT').ok).toBe(true)
  })
  it('still rejects a genuinely German product on the Italian site', () => {
    const r = matchListing('Elite Trainer Box Destined Rivals TEDESCO sigillata', etbIt, 'EBAY_IT')
    expect(r.ok).toBe(false)
    expect(r.lang).toBe('DE')
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
  // Found by the controller's independent probe: Italian sellers write the count
  // as "n.3", which normalizeQuery turns into "n 3" — so the bare-leading-digit
  // rule missed it and the title scored 0.97, the highest confidence in the whole
  // review. The matcher is most certain exactly when a lot is short and tidy.
  it('rejects the Italian "n.N" leading count', () => {
    expect(matchListing('n.3 Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT').ok).toBe(false)
    expect(matchListing('n. 2 Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT').ok).toBe(false)
    expect(matchListing('nr 2 Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT').ok).toBe(false)
  })

  it('still accepts "n.1", which is one box, not a lot', () => {
    expect(matchListing('n.1 Elite Trainer Box Destined Rivals ITA', etbIt, 'EBAY_IT').ok).toBe(true)
  })

})
