// Italian→English glossary for sealed product searches.
//
// No free API carries Italian sealed product names (tcgcsv is the US TCGplayer
// catalogue), so an Italian query can never match directly. Sealed names are
// compositional — "[Set name] + [Product type]" — and TCGdex already gives us set
// names in Italian, so only the product-type vocabulary needs translating.
// Hand-curated and deliberately not exhaustive: unmatched queries fall through to
// the fuzzy levels in sealed.ts.

const STOPWORDS = new Set(['di', 'da', 'del', 'della', 'delle', 'dei', 'con', 'per', 'the', 'of', 'and', 'il', 'lo', 'la', 'le', 'gli'])

/** Longest phrases first so multi-word entries win over their own substrings. */
const GLOSSARY: ReadonlyArray<readonly [string, string]> = [
  ["primi compagni d avventura", 'first partner pack'],
  ['primi compagni', 'first partner pack'],
  ['collezione allenatore elite', 'elite trainer box'],
  ['collezione allenatore', 'elite trainer box'],
  ['confezione allenatore elite', 'elite trainer box'],
  ['bundle buste', 'booster bundle'],
  ['bundle di buste', 'booster bundle'],
  ['box di buste', 'booster box'],
  ['scatola di buste', 'booster box'],
  ['confezione da collezione', 'collection box'],
  ['collezione speciale', 'special collection'],
  ['collezione premium', 'premium collection'],
  ['collezione porta carte', 'card file collection'],
  ['mini album', 'mini portfolio'],
  ['tris di buste', 'booster three pack'],
  ['mazzo lotta', 'battle deck'],
  ['mazzo di lotta', 'battle deck'],
  ['mazzo tematico', 'theme deck'],
  ['mazzo iniziale', 'starter deck'],
  ['bustina', 'booster pack'],
  ['bustine', 'booster pack'],
  ['buste', 'booster'],
  ['busta', 'booster pack'],
  ['scatola', 'box'],
  ['collezione', 'collection'],
  ['mazzo', 'deck'],
]

export function normalizeQuery(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function translateSealedQuery(q: string): string {
  let out = normalizeQuery(q)
  for (const [it, en] of GLOSSARY) {
    if (out.includes(it)) out = out.replace(it, en)
  }
  return out.replace(/\s+/g, ' ').trim()
}

export function queryTokens(q: string): string[] {
  return normalizeQuery(q)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}
