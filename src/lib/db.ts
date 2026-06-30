import { PrismaNeonHttp } from '@prisma/adapter-neon'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  // HTTP (fetch-based) Neon driver: one round-trip per query and no WebSocket
  // handshake — much lower TTFB than the WS pool for the single-query SSR pages
  // running as serverless functions. The app issues only single-statement
  // queries (no interactive $transaction), which HTTP mode fully supports.
  const adapter = new PrismaNeonHttp(process.env.DATABASE_URL ?? '', {})
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
