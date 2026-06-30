import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { CollectionView } from '@/components/CollectionView'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const items = await prisma.item.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  return <CollectionView initialItems={JSON.parse(JSON.stringify(items))} />
}
