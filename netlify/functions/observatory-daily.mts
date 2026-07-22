// Daily eBay observatory run. Scheduled in netlify.toml ("@daily").
//
// This is glue only: it wires the real Prisma store and the real eBay client
// into runObservatory, whose logic is unit-tested in src/lib/observatory. It runs
// under Netlify's 30s scheduled-function ceiling — runObservatory keeps a 25s
// wall-clock budget and leaves any overflow (stalest-first) for the next day.
// It now takes the daily portfolio snapshot before running the observatory.
//
// Requires env: DATABASE_URL (Neon), EBAY_APP_ID, EBAY_CERT_ID. With no eBay
// credentials searchSealed returns [] and the run is a harmless no-op.

import { prisma } from '@/lib/db'
import { runObservatory } from '@/lib/observatory/run'
import { createObservatoryStore } from '@/lib/observatory/store'
import { searchSealed } from '@/lib/observatory/ebay'
import { snapshotAllUsers } from '@/lib/snapshots/portfolioSnapshot'

export default async function handler(): Promise<Response> {
  const start = performance.now()

  // Snapshot FIRST: it is DB-only and fast, and it is the one piece of work that
  // cannot be recovered later (yesterday's portfolio value is unreconstructable).
  // runObservatory self-limits to 25s under Netlify's 30s ceiling, so letting it
  // go first could starve the snapshot entirely.
  let snapshots = 0
  try {
    snapshots = await snapshotAllUsers(prisma, new Date())
  } catch {
    // A snapshot failure must not abort the observatory run.
  }

  const store = createObservatoryStore(prisma)
  const summary = await runObservatory(store, {
    now: new Date(),
    search: searchSealed,
    elapsedMs: () => performance.now() - start, // elapsed since THIS run began
  })
  return Response.json({ ok: true, snapshots, ...summary })
}
