import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { registerSchema } from '@/lib/registerSchema'
import { hashPassword } from '@/lib/password'

export async function POST(req: NextRequest) {
  const parsed = registerSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { email, password, name } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 })
  const passwordHash = await hashPassword(password)
  await prisma.user.create({ data: { email, name: name ?? null, passwordHash } })
  return NextResponse.json({ ok: true }, { status: 201 })
}
