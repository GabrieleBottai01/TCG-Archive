import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { Dashboard } from '@/components/Dashboard'
import { euReferencesFor } from '@/lib/observatory/euReference'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const items = await prisma.item.findMany({ where: { userId: session.user.id } })
  // The dashboard balance and top-value list must reflect a STRONG EU reference too.
  const refs = await euReferencesFor(prisma, items)
  const withRefs = items.map((i) => ({ ...i, euReference: refs.get(`${i.externalId}|${i.language}`) ?? null }))
  // The value-over-time chart reads the daily snapshots. A year is ~365 rows, so
  // the whole series ships with the page and the range pills filter client-side.
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId: session.user.id },
    orderBy: { day: 'asc' },
    select: { day: true, totalValue: true, totalCost: true },
  })
  return (
    <Dashboard
      items={JSON.parse(JSON.stringify(withRefs))}
      snapshots={JSON.parse(JSON.stringify(snapshots))}
    />
  )
}
