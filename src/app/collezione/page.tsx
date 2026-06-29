import { prisma } from '@/lib/db'
import { CollectionView } from '@/components/CollectionView'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const items = await prisma.item.findMany({
    where: { userId: 'default-user' },
    orderBy: { createdAt: 'desc' },
  })
  return <CollectionView initialItems={JSON.parse(JSON.stringify(items))} />
}
