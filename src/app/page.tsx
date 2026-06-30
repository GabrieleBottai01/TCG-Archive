import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { Dashboard } from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const items = await prisma.item.findMany({ where: { userId: session.user.id } })
  return <Dashboard items={JSON.parse(JSON.stringify(items))} />
}
