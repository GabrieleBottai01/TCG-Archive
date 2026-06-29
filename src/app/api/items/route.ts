import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { itemInputSchema } from '@/lib/itemSchema'

const USER_ID = 'default-user'

export async function GET() {
  const items = await prisma.item.findMany({ where: { userId: USER_ID }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = itemInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const d = parsed.data
  const item = await prisma.item.create({
    data: { ...d, userId: USER_ID, marketValueUpdatedAt: d.marketValueSource === 'AUTO' ? new Date() : null },
  })
  return NextResponse.json({ item }, { status: 201 })
}
