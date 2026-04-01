import { expect, test } from '@playwright/test'

test('landing page loads', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Development Ready Scaffold')).toBeVisible()
})

test('login page loads', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Sign in to PATHWAYS' })).toBeVisible()
})

test('dashboard shell loads when auth bypass is enabled', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(page.getByText('Program Monitoring Shell')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Monitoring dashboard shell' })).toBeVisible()
})
