import { test, expect } from '@playwright/test'

test('add a manual sealed item appears in collection', async ({ page }) => {
  await page.goto('/collezione')

  // Open the "Aggiungi" modal
  await page.getByRole('button', { name: 'Aggiungi' }).click()

  // Switch type to SEALED — use id to disambiguate from FilterBar's "Filtra per tipo" select
  await page.locator('#modal-type').selectOption('SEALED')

  // Fill required fields using the modal form's explicit ids
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
