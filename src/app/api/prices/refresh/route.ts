import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickProvider } from '@/lib/pricing'
import { requireUserId } from '@/lib/session'

// Auto-refresh only touches values older than this, so it can be called on every
// page load without hammering the price API. The manual button forces a full refresh.
const THROTTLE_MS = 6 * 60 * 60 * 1000
// Fetch several prices at once, but bounded so we don't trip the external
// providers' rate limits (TCGdex for cards, tcgcsv for sealed — neither takes
// an API key, so there is no quota to raise if we get throttled).
const CONCURRENCY = 5

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
      const r = await pickProvider({ game: it.game, itemType: it.itemType, externalId: it.externalId })
        .fetchPrice({ game: it.game, itemType: it.itemType, externalId: it.externalId })
      if (r) {
        await prisma.item.update({
          where: { id: it.id },
          data: { marketValue: r.value, marketValueUpdatedAt: new Date() },
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

  return NextResponse.json({ updated, failed })
}
