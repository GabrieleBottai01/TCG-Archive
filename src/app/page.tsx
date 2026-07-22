import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { Dashboard } from '@/components/Dashboard'
import { euReferencesFor } from '@/lib/observatory/euReference'
import type { SnapshotPoint } from '@/lib/snapshots/series'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const items = await prisma.item.findMany({ where: { userId: session.user.id } })
  // Both lookups depend only on `items`, so they go out together rather than
  // costing the page two serial round-trips.
  const [refs, snapshots] = await Promise.all([
    // The dashboard balance and top-value list must reflect a STRONG EU reference too.
    euReferencesFor(prisma, items),
    // The value-over-time chart reads the daily snapshots. The widest range the
    // UI offers is MAX, and 400 days already exceeds it in practice, so the whole
    // series ships with the page and the range pills filter client-side.
    prisma.portfolioSnapshot.findMany({
      where: { userId: session.user.id },
      orderBy: { day: 'asc' },
      select: { day: true, totalValue: true },
      take: 400,
    }),
  ])
  const withRefs = items.map((i) => ({ ...i, euReference: refs.get(`${i.externalId}|${i.language}`) ?? null }))
  return (
    <Dashboard
      items={JSON.parse(JSON.stringify(withRefs))}
      snapshots={JSON.parse(JSON.stringify(snapshots)) as SnapshotPoint[]}
    />
  )
}
