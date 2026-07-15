import { test, expect } from '@playwright/test'

// SKIPPED: needs an authenticated session since Auth Phase 1.
// `src/app/collezione/page.tsx` now does `if (!session?.user?.id) redirect('/login')`,
// so this spec — written before auth landed and never run against it — lands on
// /login and times out waiting for the "Aggiungi" button. The assertions below
// are still the behaviour we want; re-enable them once the suite has a way to
// sign in (a seeded user + a stored storageState, or a test-only session cookie).
// Verified by running it: it fails at line 8 with a 30s timeout, not for any
// reason to do with the collection UI itself.
test.describe.skip('collection (needs auth)', () => {
test('add a manual sealed item appears in collection', async ({ page }) => {
  await page.goto('/collezione')

  // Open the "Aggiungi" modal
  await page.getByRole('button', { name: 'Aggiungi' }).click()

  // Type is a toggle now and the game selector is gone (the collection is
  // Pokémon-only). SEALED is the default; click it to be explicit.
  await page.getByRole('button', { name: 'Sigillato', exact: true }).click()

  // Name and market value moved into the collapsed "Altri dettagli" section:
  // the normal flow fills them from the search, while this test enters an item
  // by hand. Expand the section before filling.
  await page.getByText('Altri dettagli').click()
  await page.locator('#modal-name').fill('Booster Box Test E2E')
  await page.locator('#modal-market-value').fill('100')

  // Submit
  await page.getByRole('button', { name: 'Salva' }).click()

  // The new item should be visible in the collection list (appears in both table and mobile list)
  await expect(page.getByText('Booster Box Test E2E').first()).toBeVisible()

  // Totals must reflect the new item: its €100,00 market value renders (row + totals bar),
  // and the empty-state message must be gone.
  await expect(page.getByText('€ 100,00').first()).toBeVisible()
  await expect(page.getByText('Nessun articolo in collezione. Aggiungine uno!')).toHaveCount(0)
})
})
