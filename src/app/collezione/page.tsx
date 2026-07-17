import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { CollectionView } from '@/components/CollectionView'
import { euReferencesFor } from '@/lib/observatory/euReference'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const items = await prisma.item.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  // Attach the observatory's EU reference to each sealed tcgcsv item.
  const refs = await euReferencesFor(prisma, items)
  const withRefs = items.map((i) => ({ ...i, euReference: refs.get(`${i.externalId}|${i.language}`) ?? null }))
  return <CollectionView initialItems={JSON.parse(JSON.stringify(withRefs))} />
}
