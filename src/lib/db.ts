import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { PrismaClient } from '@/generated/prisma/client'

// Node has no global WebSocket until v22; the Neon serverless driver needs one.
neonConfig.webSocketConstructor = ws

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createPrismaClient() {
  // Runtime uses the pooled Neon connection (DATABASE_URL) via the WebSocket adapter.
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
