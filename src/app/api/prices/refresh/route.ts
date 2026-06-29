import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickProvider } from '@/lib/pricing'

const USER_ID = 'default-user'
// Auto-refresh only touches values older than this, so it can be called on every
// page load without hammering the price API. The manual button forces a full refresh.
const THROTTLE_MS = 6 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1'
  const staleBefore = new Date(Date.now() - THROTTLE_MS)

  const items = await prisma.item.findMany({
    where: {
      userId: USER_ID,
      marketValueSource: 'AUTO',
      externalId: { not: null },
      ...(force
        ? {}
        : { OR: [{ marketValueUpdatedAt: null }, { marketValueUpdatedAt: { lt: staleBefore } }] }),
    },
  })

  let updated = 0,
    failed = 0
  for (const it of items) {
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
  return NextResponse.json({ updated, failed })
}
