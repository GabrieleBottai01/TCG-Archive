import { prisma } from '@/lib/db'
import { Dashboard } from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const items = await prisma.item.findMany({ where: { userId: 'default-user' } })
  return <Dashboard items={JSON.parse(JSON.stringify(items))} />
}
