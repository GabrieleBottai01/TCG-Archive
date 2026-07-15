// Italian→English glossary for sealed product searches.
//
// No free API carries Italian sealed product names (tcgcsv is the US TCGplayer
// catalogue), so an Italian query can never match directly. Sealed names are
// compositional — "[Set name] + [Product type]" — and TCGdex already gives us set
// names in Italian, so only the product-type vocabulary needs translating.
// Hand-curated and deliberately not exhaustive: unmatched queries fall through to
// the fuzzy levels in sealed.ts.

const STOPWORDS = new Set(['di', 'da', 'del', 'della', 'delle', 'dei', 'con', 'per', 'the', 'of', 'and', 'il', 'lo', 'la', 'le', 'gli'])

/**
 * Human-ordered for readability; longest-phrase-wins is enforced in code (see
 * GLOSSARY_REGEX below), not by array order, so overlapping entries added in
 * any order remain safe.
 */
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const GLOSSARY_MAP: ReadonlyMap<string, string> = new Map(GLOSSARY)

// Sorted by descending key length so, at any given match position, the longest
// applicable phrase is tried (and wins) before its own shorter substrings —
// e.g. "bundle di buste" is attempted before "buste" — regardless of the
// human-authored order of GLOSSARY above.
const GLOSSARY_REGEX = new RegExp(
  GLOSSARY.map(([it]) => it)
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((it) => `\\b${escapeRegExp(it)}\\b`)
    .join('|'),
  'g'
)

export function normalizeQuery(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// normalizeQuery guarantees the input to this function is already lowercase
// a-z0-9 tokens separated by single spaces (all other characters, including
// diacritics and punctuation, are stripped). That means every token boundary
// coincides with a `\b` boundary (word char <-> space/edge), so matching
// glossary keys with `\b...\b` is safe and can't straddle partial tokens.
export function translateSealedQuery(q: string): string {
  const normalized = normalizeQuery(q)
  const translated = normalized.replace(GLOSSARY_REGEX, (match) => GLOSSARY_MAP.get(match) ?? match)
  return translated.replace(/\s+/g, ' ').trim()
}

export function queryTokens(q: string): string[] {
  return normalizeQuery(q)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}
