import { expect, test } from '@playwright/test'

test('landing page loads', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Development Ready Scaffold')).toBeVisible()
})

test('login page loads', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Sign in to PATHWAYS' })).toBeVisible()
})

test('prototype login reaches role-specific dashboard and supports role actions', async ({
  page,
}) => {
  await page.goto('/login')

  await page.getByLabel('Username or email').fill('program.manager')
  await page.getByLabel('Password', { exact: true }).fill('PathwaysDemo!2026')
  await page.getByRole('button', { name: 'Log In' }).click()

  await expect(page.getByRole('combobox', { name: 'Prototype Role Preview' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()

  await page.getByRole('combobox', { name: 'Prototype Role Preview' }).click()
  await page.getByRole('option', { name: 'Project Officer' }).click()

  await expect(page.getByRole('heading', { name: 'Project Officer dashboard' })).toBeVisible()

  await page.getByRole('button', { name: 'Submit Update' }).click()

  await expect(page.getByRole('heading', { name: 'Submit activity update' })).toBeVisible()
})
