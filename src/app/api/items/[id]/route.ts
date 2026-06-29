import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { itemInputSchema } from '@/lib/itemSchema'

const USER_ID = 'default-user'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = itemInputSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  // Scope by owner so the mutation can never touch another user's item (IDOR-safe, multi-user-ready).
  const result = await prisma.item.updateMany({ where: { id, userId: USER_ID }, data: parsed.data })
  if (result.count === 0) return NextResponse.json({ error: 'Articolo non trovato' }, { status: 404 })
  const item = await prisma.item.findUnique({ where: { id } })
  return NextResponse.json({ item })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await prisma.item.deleteMany({ where: { id, userId: USER_ID } })
  if (result.count === 0) return NextResponse.json({ error: 'Articolo non trovato' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
