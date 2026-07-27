// Live verification for the Cardmarket sealed pricing source (F-cardmarket, Task 6).
//
// This does NOT re-implement the resolver — it imports the real production
// functions from src/lib/pricing/cardmarket.ts and runs them against the real
// public S3 files. That way there is zero drift between this check and what
// actually ships.
//
// Run: npx tsx scripts/cardmarket-live-check.ts
import { cardmarketPriceFor } from '../src/lib/pricing/cardmarket'

// English catalogue product names to resolve + price. The Pokémon GO ETB is the
// anchor case (see hard assertion below); add more names here (e.g. Gabriele's
// other Cardtrader-unmapped products) as they're identified.
const NAMES = ['Pokémon GO Elite Trainer Box', 'Paldean Fates Elite Trainer Box']

const ANCHOR_NAME = 'Pokémon GO Elite Trainer Box'
const ANCHOR_PRODUCT_ID = 653700
const ANCHOR_MIN_EUR = 90
const ANCHOR_MAX_EUR = 130

async function main() {
  const results = new Map<string, { eur: number | null; productId: number | null }>()

  for (const name of NAMES) {
    const result = await cardmarketPriceFor(name)
    results.set(name, result)
    console.log(`${name} → ${result.productId} → ${result.eur}`)
  }

  const anchor = results.get(ANCHOR_NAME)
  if (!anchor) {
    console.error(`anchor check failed: "${ANCHOR_NAME}" was not in NAMES`)
    process.exit(1)
  }
  if (anchor.productId !== ANCHOR_PRODUCT_ID) {
    console.error(
      `anchor check FAILED: "${ANCHOR_NAME}" resolved to productId ${anchor.productId}, expected ${ANCHOR_PRODUCT_ID}`,
    )
    process.exit(1)
  }
  if (anchor.eur == null || anchor.eur < ANCHOR_MIN_EUR || anchor.eur > ANCHOR_MAX_EUR) {
    console.error(
      `anchor check FAILED: "${ANCHOR_NAME}" (productId ${anchor.productId}) priced at ${anchor.eur}, expected between ${ANCHOR_MIN_EUR} and ${ANCHOR_MAX_EUR}`,
    )
    process.exit(1)
  }

  console.log(`anchor OK: ${ANCHOR_NAME} → ${anchor.productId} → €${anchor.eur}`)
}

main().catch((err) => {
  console.error('live-check errored:', err)
  process.exit(1)
})
