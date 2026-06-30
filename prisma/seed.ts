import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'
import { PrismaClient } from '../src/generated/prisma/client'

neonConfig.webSocketConstructor = ws

// Seeding runs from the Prisma CLI — use the direct (non-pooled) connection.
const adapter = new PrismaNeon({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.user.upsert({
    where: { id: 'default-user' },
    update: {},
    create: { id: 'default-user', name: 'Default', email: 'default@tcgarchive.local' },
  })
  console.log('Seeded default user')
}

main().finally(() => prisma.$disconnect())
