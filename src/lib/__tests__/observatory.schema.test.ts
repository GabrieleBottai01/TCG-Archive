import { it, expect } from 'vitest'
import type { Prisma } from '@/generated/prisma/client'

// COMPILE-TIME PIN, not a runtime test.
//
// Nothing consumes EbayObservation/PriceReference yet (the daily job lands in a
// later task), so without this file no line of code references those models and
// a schema drift would go unnoticed. The `satisfies` clauses below are the whole
// point: they fail under `npx tsc --noEmit` if a field is renamed, retyped or
// removed, or if a compound unique is dropped (that changes the generated
// WhereUniqueInput key name). Vitest does not type-check, so these never fail in
// `npm test` — the tsc gate is what enforces them.
//
// Deliberately no runtime assertions on these literals: checking an object the
// same file just declared against a list the same file just wrote proves nothing.
// Delete this file once real code uses the models.

// --- EbayObservation: raw, pruned at 30 days ---

// `lang` is the PRODUCT's language (IT/EN/JA), never the marketplace's.
const observation = {
  productKey: 'tcgcsv:23234:517001',
  ebayItemId: 'v1|123456789012|0',
  marketplace: 'EBAY_IT',
  lang: 'IT',
  priceEur: 59.99,
  quantity: 3,
  firstSeenAt: new Date('2026-07-01T00:00:00Z'),
  lastSeenAt: new Date('2026-07-10T00:00:00Z'),
  goneAt: null,
  confidence: 0.8,
} satisfies Prisma.EbayObservationUncheckedCreateInput

// quantity/goneAt are nullable: a listing with no stated stock, still live.
const minimalObservation = {
  productKey: 'tcgcsv:23234:517001',
  ebayItemId: 'v1|999|0',
  marketplace: 'EBAY_DE',
  lang: 'EN',
  priceEur: 59.99,
  firstSeenAt: new Date('2026-07-01T00:00:00Z'),
  lastSeenAt: new Date('2026-07-10T00:00:00Z'),
  confidence: 0.5,
} satisfies Prisma.EbayObservationUncheckedCreateInput

// The daily job upserts on this key; if the @@unique is dropped, this stops compiling.
const observationKey = {
  ebayItemId_marketplace: { ebayItemId: 'v1|123456789012|0', marketplace: 'EBAY_DE' },
} satisfies Prisma.EbayObservationWhereUniqueInput

// --- PriceReference: permanent daily aggregate, survives the pruning ---

const reference = {
  productKey: 'tcgcsv:23234:517001',
  lang: 'JA',
  day: new Date('2026-07-10'),
  medianEur: 59.99,
  sampleSize: 5,
  confirmedSales: 2,
  quickSales: 1,
  strength: 'STRONG',
} satisfies Prisma.PriceReferenceUncheckedCreateInput

// medianEur is null on a day with no usable sample — the app must show "no data",
// not a fabricated number.
const emptyDay = {
  productKey: 'tcgcsv:23234:517001',
  lang: 'IT',
  day: new Date('2026-07-10'),
  medianEur: null,
  sampleSize: 0,
  confirmedSales: 0,
  quickSales: 0,
  strength: 'NONE',
} satisfies Prisma.PriceReferenceUncheckedCreateInput

// One row per product/language/day — the roll-up depends on it.
const referenceKey = {
  productKey_lang_day: { productKey: 'tcgcsv:23234:517001', lang: 'IT', day: new Date('2026-07-10') },
} satisfies Prisma.PriceReferenceWhereUniqueInput

it('pins the observatory model shapes at compile time', () => {
  // The assertion is a formality so vitest has a case to run; `tsc --noEmit` is
  // what actually enforces the shapes above.
  expect([observation, minimalObservation, observationKey, reference, emptyDay, referenceKey]).toHaveLength(6)
})
