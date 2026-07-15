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
    code: 'opened',
    explanation: 'opened box — the contents are no longer sealed',
    regex: /(?<!\b(?:mai|non|nie|nicht|never|not)\s)\b(?:aperta|aperto|aperte|aperti|opened|geoffnet)\b/g,
  },
  {
    // A preorder price is a future price (often a deposit), not a spot price.
    code: 'preorder',
    explanation: 'preorder — a future price, not the current market price',
    regex: termRegex(['preorder', 'pre order', 'preordine', 'pre ordine', 'prenotazione', 'vorbestellung']),
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
    code: 'lot',
    explanation: 'job-lot ("stock") — the price is not per unit',
    regex: /(?<!\bin\s)\bstock\b/g,
  },
]

// "3x Elite Trainer Box" is a lot even when the seller never writes "lotto",
// and its price is a multiple of the one we want.
const MULTIPLIER_REGEX = /\b(?:(\d+)\s*x|x\s*(\d+))\b/g

const LANGUAGE_MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['IT', termRegex(['ita', 'italiano', 'italiana', 'italiane', 'italiani'])],
  ['EN', termRegex(['eng', 'english', 'englisch', 'inglese'])],
  ['JA', termRegex(['jap', 'jpn', 'japan', 'japanese', 'japanisch', 'giapponese', 'giapponesi'])],
  ['DE', termRegex(['de', 'deutsch', 'deutsche', 'german', 'germany', 'germania', 'tedesco', 'tedesca'])],
]

function reject(reason: string, lang: string | null = null): ListingMatch {
  return { ok: false, lang, confidence: 0, reason }
}

/** First exclusion term present in the normalized title, if any. */
function findExclusion(normalizedTitle: string): { code: string; reason: string } | null {
  for (const rule of EXCLUSION_RULES) {
    const hit = normalizedTitle.match(rule.regex)?.[0]
    if (hit) {
      return { code: rule.code, reason: `excluded (${rule.code}): ${rule.explanation} — matched "${hit}"` }
    }
  }
  for (const m of normalizedTitle.matchAll(MULTIPLIER_REGEX)) {
    const quantity = Number(m[1] ?? m[2])
    if (quantity >= 2) {
      return {
        code: 'lot',
        reason: `excluded (lot): multi-item lot — the price is not per unit — matched "${m[0]}"`,
      }
    }
  }
  return null
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
 * Confidence, for accepted listings only, is deliberately legible rather than
 * clever — it starts at 1 and is docked for the two things that make an
 * otherwise-valid match less certain:
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

  // 4. The title must not also offer a product type the product does not have:
  //    "Elite Trainer Box + Booster Bundle" contains every ETB token but is
  //    priced as two products.
  // A type the product already has does not count, and neither does a generic
  // one that a type it has already contains: "scatola sigillata" translates to
  // "box", which is the same box, not a second product. "+ 1 booster", by
  // contrast, is not contained in "elite trainer box" and is a real second item.
  const nameTypes = new Set(extractProductType(translatedName).productTypes)
  const extraTypes = extractProductType(translatedTitle).productTypes.filter(
    (t) => !nameTypes.has(t) && ![...nameTypes].some((n) => n.includes(t))
  )
  if (extraTypes.length > 0) {
    return reject(`bundle: the title also offers "${extraTypes.join('", "')}" — the price is not for this product alone`, lang)
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
