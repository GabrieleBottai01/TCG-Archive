import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickProvider } from '@/lib/pricing'
import { requireUserId } from '@/lib/session'
import { snapshotUser, startOfUtcDay } from '@/lib/snapshots/portfolioSnapshot'

// Auto-refresh only touches values older than this, so it can be called on every
// page load without hammering the price API. The manual button forces a full refresh.
const THROTTLE_MS = 6 * 60 * 60 * 1000
// Fetch several prices at once, but bounded so we don't trip the external
// providers' rate limits (TCGdex for cards, tcgcsv for sealed — neither takes
// an API key, so there is no quota to raise if we get throttled).
const CONCURRENCY = 5

// Cardtrader's marketplace endpoint allows ~1 req/s. Space out sealed repricings
// (the only ones that hit Cardtrader) so a bulk refresh does not trip the limit.
let ctNextAt = 0
async function ctSpace() {
  const now = Date.now()
  const wait = Math.max(0, ctNextAt - now)
  ctNextAt = Math.max(now, ctNextAt) + 1100
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const force = req.nextUrl.searchParams.get('force') === '1'
  const staleBefore = new Date(Date.now() - THROTTLE_MS)

  const items = await prisma.item.findMany({
    where: {
      userId,
      marketValueSource: 'AUTO',
      externalId: { not: null },
      ...(force
        ? {}
        : { OR: [{ marketValueUpdatedAt: null }, { marketValueUpdatedAt: { lt: staleBefore } }] }),
    },
  })

  let updated = 0,
    failed = 0

  async function reprice(it: (typeof items)[number]) {
    try {
      if (it.itemType === 'SEALED' && it.externalId?.startsWith('tcgcsv:')) {
        await ctSpace()
      }
      const input = {
        game: it.game,
        itemType: it.itemType,
        externalId: it.externalId,
        name: it.name,
        priceQuery: it.priceQuery,
        cardtraderBlueprintId: it.cardtraderBlueprintId,
        language: it.language,
      }
      const r = await pickProvider(input).fetchPrice(input)
      if (r) {
        await prisma.item.update({
          where: { id: it.id },
          data: {
            marketValue: r.value,
            marketValueUpdatedAt: new Date(),
            autoPriceSource: r.origin ?? null,
            // Persist a newly-resolved blueprint id so next refresh is a direct lookup.
            ...(r.cardtraderBlueprintId != null ? { cardtraderBlueprintId: r.cardtraderBlueprintId } : {}),
          },
        })
        updated++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  // Worker pool: at most CONCURRENCY items are in flight at once. Each worker
  // pulls the next item until the queue drains, so wall-clock time is bounded
  // by the slowest lane rather than the sum of every sequential fetch.
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const it = items[cursor++]
      await reprice(it)
    }
  })
  await Promise.all(workers)

  // Keep today's point fresh: the stored marketValues only move when this route
  // runs, so re-snapshot right after — but only when it would actually add
  // information. If nothing was repriced (the common case: 6h throttle found
  // nothing stale), only snapshot when today's row is still missing, so a
  // dashboard mount doesn't pay ~20 sequential DB round trips for a no-op.
  // The nightly job still guarantees a row on days the app is never opened.
  // Upsert on (userId, day) — last write wins.
  try {
    const day = startOfUtcDay(new Date())
    const exists =
      updated > 0
        ? null
        : await prisma.portfolioSnapshot.findUnique({ where: { userId_day: { userId, day } }, select: { id: true } })
    if (updated > 0 || !exists) await snapshotUser(prisma, userId, new Date())
  } catch (e) {
    // Never fail a price refresh because the snapshot could not be written.
    console.error('portfolio snapshot failed', e)
  }

  return NextResponse.json({ updated, failed })
}
