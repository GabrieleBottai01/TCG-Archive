import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@/generated/prisma/client'

// The WebSocket (Pool) Neon driver — NOT the HTTP one. The app genuinely needs
// transactions: item edit/delete (PUT/DELETE use updateMany/deleteMany) and the
// whole observatory job (upsert/updateMany/deleteMany) are run by Prisma inside a
// transaction. The HTTP driver throws "Transactions are not supported in HTTP
// mode" (seen live as a 500 on every edit); the Pool over WebSocket supports
// them. Slightly higher TTFB than HTTP for single-query reads — an acceptable
// trade for writes that actually work.
//
// Node 20 (the Netlify build's NODE_VERSION) has no global WebSocket, so the
// serverless driver has to be handed one explicitly.
neonConfig.webSocketConstructor = ws

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL ?? '' })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
