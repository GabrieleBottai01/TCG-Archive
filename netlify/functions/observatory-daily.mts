// Daily eBay observatory run. Scheduled in netlify.toml ("@daily").
//
// This is glue only: it wires the real Prisma store and the real eBay client
// into runObservatory, whose logic is unit-tested in src/lib/observatory. It runs
// under Netlify's 30s scheduled-function ceiling — runObservatory keeps a 25s
// wall-clock budget and leaves any overflow (stalest-first) for the next day.
//
// Requires env: DATABASE_URL (Neon), EBAY_APP_ID, EBAY_CERT_ID. With no eBay
// credentials searchSealed returns [] and the run is a harmless no-op.

import { prisma } from '@/lib/db'
import { runObservatory } from '@/lib/observatory/run'
import { createObservatoryStore } from '@/lib/observatory/store'
import { searchSealed } from '@/lib/observatory/ebay'

export default async function handler(): Promise<Response> {
  const start = performance.now()
  const store = createObservatoryStore(prisma)
  const summary = await runObservatory(store, {
    now: new Date(),
    search: searchSealed,
    elapsedMs: () => performance.now() - start, // elapsed since THIS run began
  })
  return Response.json({ ok: true, ...summary })
}
