// Decides which eBay listings are allowed to inform a sealed product's price.
//
// The observatory learns a EU price from the median of observed listings, so a
// single wrong listing poisons the number — and a poisoned number is worse than
// the US estimate it replaces, because it *looks* local and trustworthy. The
// rule everywhere below is therefore: discard when in doubt. A false accept is a
// bug; a false reject only costs sample size.
//
// All string handling goes through `sealedGlossary` (normalizeQuery /
// translateSealedQuery / queryTokens / extractProductType). This module must
// never hand-roll its own normalisation: this repo already shipped a bug where
// two normalisers disagreed about `&` and every set with an ampersand silently
// returned zero results.

import {
  extractProductType,
  normalizeQuery,
  queryTokens,
  translateSealedQuery,
} from '@/lib/pricing/sealedGlossary'

export type Marketplace = 'EBAY_IT' | 'EBAY_DE'

export type ListingMatch = {
  ok: boolean
  /** Language of the PRODUCT, not of the site. Null when it cannot be decided. */
  lang: string | null
  /** [0,1]. The caller thresholds it; rejections are always 0. */
  confidence: number
  /** Says which rule fired. This is what makes a bad matcher debuggable. */
  reason: string
}

type Product = { name: string; lang: string }

// A German seller listing a German product does not write the language — it is
// obvious to him. So "no marker" means "the marketplace's own language", which
// is why an unmarked .de listing is German and gets dropped.
const MARKETPLACE_DEFAULT_LANG: Record<Marketplace, string> = {
  EBAY_IT: 'IT',
  EBAY_DE: 'DE',
}

// Three lines duplicated from sealedGlossary.ts on purpose: that module does not
// export it and is off-limits to this task. Importing it is the right fix and is
// flagged in the task report — a *behavioural* copy of the glossary would be the
// dangerous kind of duplication, and this is not one.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Terms are matched against an already-normalized string (lowercase a-z0-9
// tokens separated by single spaces), so every token boundary coincides with a
// `\b` boundary — the same technique, and the same guarantee, as the glossary's
// own regexes.
function termRegex(terms: readonly string[]): RegExp {
  return new RegExp(`\\b(?:${terms.map(escapeRegExp).join('|')})\\b`, 'g')
}

type ExclusionRule = { code: string; explanation: string; regex: RegExp }

const EXCLUSION_RULES: readonly ExclusionRule[] = [
  {
    code: 'exclusive',
    explanation: 'Pokemon Center exclusive — a different product, up to 3x the retail price',
    regex: termRegex(['pokemon center']),
  },
  {
    // Same family as the empty box: the parts pulled *out* of an ETB (promo
    // card, sleeves, dividers) sell for a couple of euro and would drag the
    // median through the floor. "con carta promo" is deliberately NOT excluded —
    // a full ETB legitimately contains one — so only the part-only phrasings and
    // the accessories themselves are listed here.
    code: 'parts',
    explanation: 'accessories/parts sold out of the box — not the sealed product',
    regex: termRegex([
      'sleeves',
      'bustine protettive',
      'dividers',
      'divisori',
      'solo promo',
      'solo la promo',
      'solo carta',
      'solo carte',
      'solo le carte',
      'only promo',
      'only card',
      'only cards',
      'promo only',
      'nur promo',
      'nur karten',
    ]),
  },
  {
    // An opened box is a different price, but "mai aperta" / "nicht geöffnet" is
    // the single most common way an Italian or German seller says SEALED — so
    // the negators must survive. ("ungeoffnet" needs no negator: \b keeps
    // "geoffnet" from matching inside it.)
    //
    // German sellers write "geöffnet" both accented (normalizeQuery strips the
    // umlaut to "geoffnet") and transliterated ("geoeffnet"); both spellings, and
    // their adjectival endings, have to be here or the .de half of the sample
    // silently lets opened boxes through.
    code: 'opened',
    explanation: 'opened box — the contents are no longer sealed',
    regex:
      /(?<!\b(?:mai|non|nie|nicht|never|not)\s)\b(?:aperta|aperto|aperte|aperti|opened|geoffnet|geoffnete|geoffneter|geoeffnet|geoeffnete|geoeffneter)\b/g,
  },
  {
    // Used is a different price, but "mai usata" / "nicht gebraucht" says NEW, so
    // this rule carries the same negators as `opened`. "senza sigilli" needs none
    // — it is unambiguous, and it is the phrase that separates a resealed-looking
    // box from a sealed one.
    code: 'used',
    explanation: 'used / not sealed — a different price from a sealed unit',
    regex:
      /(?<!\b(?:mai|non|nie|nicht|never|not)\s)\b(?:usata|usato|usate|usati|gebraucht|gebrauchte|second hand)\b|\bsenza sigill(?:o|i)\b|\bdi seconda mano\b/g,
  },
  {
    // A wanted ad is not a sale at all: it is what a *buyer* hopes to pay, which
    // is systematically below market. It drags the median DOWN and it looks
    // exactly like a normal listing, so nothing else on this list catches it.
    code: 'wanted',
    explanation: 'wanted ad (buy offer) — not a price anyone sold at',
    regex: termRegex([
      'cerco',
      'cercasi',
      'compro',
      'comprasi',
      'suche',
      'suchen',
      'kaufe',
      'kaufgesuch',
      'wtb',
      'wanted',
      'looking for',
    ]),
  },
  {
    // "SOLO SPEDIZIONE" listings price the postage, not the box — a few euro that
    // would sit at the bottom of the sample next to the empty shells.
    code: 'postage',
    explanation: 'postage-only listing — the price is the shipping, not the product',
    regex: termRegex([
      'solo spedizione',
      'solo le spese di spedizione',
      'solo costi di spedizione',
      'shipping only',
      'only shipping',
      'nur versand',
      'versandkosten only',
    ]),
  },
  {
    // A preorder price is a future price, and a deposit ("acconto", "caparra",
    // "Anzahlung") is a *fraction* of even that — the preorder trap wearing a
    // different word.
    code: 'preorder',
    explanation: 'preorder / deposit — a future or partial price, not the current market price',
    regex: termRegex([
      'preorder',
      'pre order',
      'preordine',
      'pre ordine',
      'preordina',
      'prenotazione',
      'prenotazioni',
      'prenota',
      'prenotare',
      'prenotalo',
      'acconto',
      'caparra',
      'deposit',
      'anzahlung',
      'vorbestellung',
      'vorbestellen',
    ]),
  },
  {
    // The worst trap of all: an empty collectors' shell would teach the app that
    // an Elite Trainer Box is worth 15 euro.
    code: 'empty',
    explanation: 'empty box / collectors shell — no sealed contents',
    regex: termRegex([
      'vuota',
      'vuoto',
      'vuote',
      'vuoti',
      'empty',
      'solo scatola',
      'solo box',
      'only box',
      'box only',
      'senza buste',
      'senza bustine',
      'senza carte',
      'nur box',
      'nur die box',
      'leer',
      'leere',
    ]),
  },
  {
    code: 'fake',
    explanation: 'proxy / custom / repack / fake — not the retail product',
    regex: termRegex(['proxy', 'custom', 'repack', 'fake', 'replica', 'riproduzione']),
  },
  {
    code: 'lot',
    explanation: 'multi-item lot — the price is not per unit',
    regex: termRegex(['lotto', 'lotti', 'bundle di']),
  },
  {
    // "stock" in Italian commerce means a job lot ("stock di 10 ETB") and must
    // go. But "IN STOCK / pronta consegna" is everyday Italian eBay for a single
    // unit in hand, and dropping those would cost real volume for nothing — so
    // only the bare, non-"in" sense is excluded. A quantity in a genuine job lot
    // is caught by the multiplier rule below anyway.
    code: 'job-lot',
    explanation: 'job-lot ("stock") — the price is not per unit',
    regex: /(?<!\bin\s)\bstock\b/g,
  },
]

// ---------------------------------------------------------------------------
// Multi-unit detection
// ---------------------------------------------------------------------------
// A lot's price is N times the price we want, and "3x" is only one of the many
// ways sellers write N. The rest — a bare leading count ("3 Elite Trainer Box
// ..."), a count plus a quantity noun ("3 pezzi", "2 Stück"), and the word forms
// ("coppia", "doppia confezione", "set di 2") — all used to sail straight
// through, and the tidier the lot's title the HIGHER the confidence it scored.
//
// The counterweight is that a number in a title is usually NOT a quantity: it is
// a set name ("151"), a year, a card number. So a digit only counts as a
// quantity when it is bound to a quantity noun, or when it leads the title *and*
// is a plausible lot size. Anything short of that is left to reject on its own
// merits or accept — an ambiguous number is exactly where we prefer the false
// reject.

const COUNT_WORDS = 'due|tre|quattro|cinque|two|three|four|five|zwei|drei|vier'

const COUNT_WORD_VALUE: Readonly<Record<string, number>> = {
  due: 2, tre: 3, quattro: 4, cinque: 5,
  two: 2, three: 3, four: 4, five: 5,
  zwei: 2, drei: 3, vier: 4,
}

const QUANTITY_NOUNS =
  'pezzi|pezzo|pz|pcs|pieces|piece|stuck|stucke|stk|confezioni|scatole|boxes|units|unita|einheiten|exemplare'

// A leading bare count is only read as a quantity up to this value: "151 Elite
// Trainer Box" and "2024 ..." are a set and a year, not twenty-four hundred boxes.
const MAX_PLAUSIBLE_LOT = 20

const MULTI_UNIT_EXPLANATION = 'multiple units in one listing — the price is not per unit'

type MultiUnitPattern = {
  regex: RegExp
  /** Units offered, per this pattern. Anything >= 2 is a lot. */
  quantity: (m: RegExpMatchArray) => number
  /** Upper bound past which the number is not credible as a quantity. */
  max: number
}

const MULTI_UNIT_PATTERNS: readonly MultiUnitPattern[] = [
  // "3x Elite Trainer Box", "Elite Trainer Box x3". "1x" is a single unit.
  { regex: /\b(?:(\d+)\s*x|x\s*(\d+))\b/g, quantity: (m) => Number(m[1] ?? m[2]), max: Infinity },
  // "3 pezzi", "2 Stück", "2 pieces" — a digit bound to a quantity noun.
  {
    regex: new RegExp(`\\b(\\d+)\\s*(?:${QUANTITY_NOUNS})\\b`, 'g'),
    quantity: (m) => Number(m[1]),
    max: Infinity,
  },
  // "due pezzi", "zwei Stück".
  {
    regex: new RegExp(`\\b(${COUNT_WORDS})\\s+(?:${QUANTITY_NOUNS})\\b`, 'g'),
    quantity: (m) => COUNT_WORD_VALUE[m[1]] ?? 0,
    max: Infinity,
  },
  // "set di 2", "lotto di tre", "set of two".
  {
    regex: new RegExp(`\\b(?:set|lotto|lot|bundle|pacchetto|pack)\\s+(?:di|of|von)\\s+(\\d+|${COUNT_WORDS})\\b`, 'g'),
    quantity: (m) => COUNT_WORD_VALUE[m[1]] ?? Number(m[1]),
    max: Infinity,
  },
  // The word forms that name a quantity without a number at all.
  {
    regex: termRegex(['coppia', 'coppie', 'doppia', 'doppio', 'doppie', 'doppi', 'pair', 'paar', 'twin pack', 'double pack']),
    quantity: () => 2,
    max: Infinity,
  },
  // A bare count in leading position: "3 Elite Trainer Box Destined Rivals ITA".
  // The optional `n`/`nr` prefix covers how Italian and German sellers actually
  // write it — "n.3 Elite Trainer Box", "nr 2 ETB". normalizeQuery strips the
  // dot, so those arrive as "n 3 ..." and the bare-digit rule alone misses them.
  // `no` is deliberately NOT accepted here: "No. 2 Trainer" is a real card name.
  { regex: /^(?:n(?:r)?\s+)?(\d+)\s/g, quantity: (m) => Number(m[1]), max: MAX_PLAUSIBLE_LOT },
  { regex: new RegExp(`^(${COUNT_WORDS})\\s`, 'g'), quantity: (m) => COUNT_WORD_VALUE[m[1]] ?? 0, max: Infinity },
]

function findMultiUnit(normalizedTitle: string): { code: string; reason: string } | null {
  for (const pattern of MULTI_UNIT_PATTERNS) {
    for (const m of normalizedTitle.matchAll(pattern.regex)) {
      const quantity = pattern.quantity(m)
      if (quantity >= 2 && quantity <= pattern.max) {
        return {
          code: 'multi-unit',
          reason: `excluded (multi-unit): ${MULTI_UNIT_EXPLANATION} — matched "${m[0].trim()}"`,
        }
      }
    }
  }
  return null
}

const LANGUAGE_MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['IT', termRegex(['ita', 'italiano', 'italiana', 'italiane', 'italiani'])],
  ['EN', termRegex(['eng', 'english', 'englisch', 'inglese'])],
  ['JA', termRegex(['jap', 'jpn', 'japan', 'japanese', 'japanisch', 'giapponese', 'giapponesi'])],
  // Language words only. "Germania"/"Germany" is where the parcel ships FROM and
  // bare "de" is a preposition ("de luxe", "carte de..."): neither says a word
  // about what language the cards are printed in. Treating them as markers made
  // "spedizione da Germania" reject with the confidently wrong reason "the title
  // claims IT and DE" — and `reason` is the debugging surface, so a wrong one
  // costs more than the volume did.
  ['DE', termRegex(['deutsch', 'deutsche', 'deutschen', 'german', 'tedesco', 'tedesca', 'tedeschi', 'tedesche'])],
]

function reject(reason: string, lang: string | null = null): ListingMatch {
  return { ok: false, lang, confidence: 0, reason }
}

function countOccurrences(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return counts
}

/** First exclusion term present in the normalized title, if any. */
function findExclusion(normalizedTitle: string): { code: string; reason: string } | null {
  for (const rule of EXCLUSION_RULES) {
    const hit = normalizedTitle.match(rule.regex)?.[0]
    if (hit) {
      return { code: rule.code, reason: `excluded (${rule.code}): ${rule.explanation} — matched "${hit}"` }
    }
  }
  return findMultiUnit(normalizedTitle)
}

type LanguageVerdict =
  | { kind: 'explicit'; lang: string; marker: string }
  | { kind: 'default'; lang: string }
  | { kind: 'ambiguous'; langs: string[] }

function detectLanguage(normalizedTitle: string, marketplace: Marketplace): LanguageVerdict {
  const hits: Array<{ lang: string; marker: string }> = []
  for (const [lang, regex] of LANGUAGE_MARKERS) {
    const marker = normalizedTitle.match(regex)?.[0]
    if (marker) hits.push({ lang, marker })
  }
  if (hits.length === 0) return { kind: 'default', lang: MARKETPLACE_DEFAULT_LANG[marketplace] }
  if (hits.length === 1) return { kind: 'explicit', lang: hits[0].lang, marker: hits[0].marker }
  // Two languages claimed at once ("ITA / ENG") — we cannot tell which product
  // the price belongs to, so we do not guess.
  return { kind: 'ambiguous', langs: hits.map((h) => h.lang) }
}

/**
 * Decides whether `title` is a listing for exactly `product`, sealed, in
 * `product.lang`, at a per-unit price.
 *
 * `ok` is the whole answer. The exclusion rules are the only defence against a
 * wrong listing reaching the median; if `ok` is true, this module believes the
 * listing.
 *
 * ## `confidence` is NOT a false-accept threshold — do not use it as one
 *
 * It ranks *title tidiness*, not correctness. It is computed only from listings
 * that already passed every rule, and it knows nothing the rules do not: a lot,
 * a wanted ad or an opened box that slips past an exclusion scores by the same
 * formula as an honest listing — and, being short and tidy, usually scores
 * HIGHER. A review of adversarial titles found the single highest-scoring result
 * in the whole set (0.97) was a false accept, and 6 of 16 false accepts scored
 * >= 0.91. Filtering on `confidence >= x` would therefore preferentially keep
 * the bad ones. Use it to rank or to display, never to admit.
 *
 * For accepted listings it is deliberately legible rather than clever — it
 * starts at 1 and is docked for the two things that make an otherwise-valid
 * match less certain:
 *   -0.15  the language was inferred from the marketplace default, not stated
 *   -0.03  per token of the title that is not part of the product name, capped
 *          at -0.25 (a long noisy title is likelier to be something else too)
 */
export function matchListing(title: string, product: Product, marketplace: Marketplace): ListingMatch {
  const normalizedTitle = normalizeQuery(title)
  if (normalizedTitle === '') return reject('title: empty after normalisation')

  // 1. Exclusions first: they are the rules that keep the median honest, and
  //    they also give the most useful reason when several rules would fire.
  const excluded = findExclusion(normalizedTitle)
  if (excluded) return reject(excluded.reason)

  // 2. Language of the product (never of the site).
  const verdict = detectLanguage(normalizedTitle, marketplace)
  if (verdict.kind === 'ambiguous') {
    return reject(`language: ambiguous — the title claims ${verdict.langs.join(' and ')}`)
  }
  const lang = verdict.lang
  const stated = verdict.kind === 'explicit' ? `marker "${verdict.marker}"` : `${marketplace} default (no marker)`
  if (lang === 'DE') {
    return reject(`language: German product (${stated}) — a different product at a different price`, lang)
  }
  if (lang !== product.lang) {
    return reject(`language: detected ${lang} (${stated}), product is ${product.lang}`, lang)
  }

  // 3. Every token of the glossary-translated product name must be present.
  const translatedTitle = translateSealedQuery(title)
  const translatedName = translateSealedQuery(product.name)
  const required = queryTokens(translatedName)
  if (required.length === 0) {
    return reject(`product: name "${product.name}" has no usable tokens to match on`, lang)
  }
  const titleTokens = queryTokens(translatedTitle)
  const present = new Set(titleTokens)
  const missing = required.filter((t) => !present.has(t))
  if (missing.length > 0) {
    return reject(`name: title is missing ${missing.length}/${required.length} token(s): ${missing.join(', ')}`, lang)
  }

  // 4. The title must not offer more product than the product itself is:
  //    "Elite Trainer Box + Booster Bundle" contains every ETB token but is
  //    priced as two products — and so is "ETB + ETB", which is why this counts
  //    occurrences rather than testing set membership. A membership test cannot
  //    see a second unit of the SAME type: it filters `elite trainer box` out as
  //    "the product already has that type" and a two-ETB lot reads as one ETB.
  //
  // A type the product already has is allowed exactly as many times as the name
  // has it, and a generic type subsumed by one the name has does not count at
  // all: "scatola sigillata" translates to "box", which is the same box, not a
  // second product. "+ 1 booster", by contrast, is not contained in "elite
  // trainer box" and is a real second item.
  const nameTypeCounts = countOccurrences(extractProductType(translatedName).productTypes)
  const titleTypeCounts = countOccurrences(extractProductType(translatedTitle).productTypes)
  const nameTypes = [...nameTypeCounts.keys()]
  for (const [type, count] of titleTypeCounts) {
    const allowed = nameTypeCounts.get(type) ?? 0
    if (allowed === 0 && nameTypes.some((n) => n !== type && n.includes(type))) continue
    if (count > allowed) {
      const detail =
        allowed === 0
          ? `also offers "${type}"`
          : `offers "${type}" ${count} times over`
      return reject(`bundle: the title ${detail} — the price is not for this product alone`, lang)
    }
  }

  const requiredSet = new Set(required)
  const noiseTokens = titleTokens.filter((t) => !requiredSet.has(t)).length
  const languagePenalty = verdict.kind === 'explicit' ? 0 : 0.15
  const noisePenalty = Math.min(0.25, 0.03 * noiseTokens)
  const confidence = Math.round((1 - languagePenalty - noisePenalty) * 100) / 100

  return {
    ok: true,
    lang,
    confidence,
    reason: `ok: all ${required.length} name token(s) present; language ${lang} from ${stated}; ${noiseTokens} extra title token(s)`,
  }
}
