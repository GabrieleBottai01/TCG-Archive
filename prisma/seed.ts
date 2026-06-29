import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
})
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.user.upsert({
    where: { id: 'default-user' },
    update: {},
    create: { id: 'default-user', name: 'Default' },
  })
  console.log('Seeded default user')
}

main().finally(() => prisma.$disconnect())
