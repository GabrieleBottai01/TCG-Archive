import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { itemInputSchema } from '@/lib/itemSchema'
import { requireUserId } from '@/lib/session'

export async function GET() {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const items = await prisma.item.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const parsed = itemInputSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data
  const item = await prisma.item.create({
    data: { ...d, userId, marketValueUpdatedAt: d.marketValueSource === 'AUTO' ? new Date() : null },
  })
  return NextResponse.json({ item }, { status: 201 })
}
