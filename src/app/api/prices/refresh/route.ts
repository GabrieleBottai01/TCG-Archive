import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickProvider } from '@/lib/pricing'

const USER_ID = 'default-user'

export async function POST() {
  const items = await prisma.item.findMany({
    where: { userId: USER_ID, marketValueSource: 'AUTO', externalId: { not: null } },
  })
  let updated = 0, failed = 0
  for (const it of items) {
    try {
      const r = await pickProvider({ game: it.game, itemType: it.itemType, externalId: it.externalId })
        .fetchPrice({ game: it.game, itemType: it.itemType, externalId: it.externalId })
      if (r) {
        await prisma.item.update({ where: { id: it.id }, data: { marketValue: r.value, marketValueUpdatedAt: new Date() } })
        updated++
      } else { failed++ }
    } catch { failed++ }
  }
  return NextResponse.json({ updated, failed })
}
