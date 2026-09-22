import { expect, test } from '@playwright/test'

test('staff login keeps its real credential form at desktop and mobile widths', async ({
  page,
}, info) => {
  await page.goto('/staff/login')
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('staff-login-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('staff-login-mobile.png'), fullPage: true })
})

test('anonymous public directory states its publication outage without fabricated projects', async ({
  page,
}, info) => {
  await page.goto('/public/projects')
  await expect(
    page.getByRole('heading', { name: 'Public tracker temporarily unavailable' }),
  ).toBeVisible()
  await expect(page.getByText('Futuremakers', { exact: false })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('public-directory-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('heading', { name: 'Public tracker temporarily unavailable' }),
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('public-directory-mobile.png'), fullPage: true })
})
