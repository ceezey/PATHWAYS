import { expect, test } from '@playwright/test'

test('I01/I02: local login, profile propagation, audit, role denial and reset', async ({
  page,
}, info) => {
  test.setTimeout(90000)
  page.on('pageerror', (error) => console.error('Browser error:', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('Browser console:', message.text())
  })
  page.on('requestfailed', (request) =>
    console.error('Request failed:', request.url(), request.failure()?.errorText),
  )
  const externalWrites: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/'))
      externalWrites.push(request.url())
  })
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  await page.getByLabel('Fictional account').selectOption('project-officer')
  await expect(page.getByRole('status')).toContainText('Review state updated.', { timeout: 15000 })
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
    ),
  ).toBe('project-officer')
  await page.goto('/settings/profile')
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible({ timeout: 20000 })
  await page.getByLabel('Name', { exact: false }).first().fill('Fictional Officer Revised')
  await page
    .getByLabel('Email address', { exact: false })
    .fill('revised.officer@demo.pathways.local')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(
    page.getByText('Profile and local sign-in email updated.', { exact: false }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Email address', { exact: false })).toHaveValue(
    'revised.officer@demo.pathways.local',
  )
  await page.screenshot({ path: info.outputPath('profile-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('profile-mobile.png'), fullPage: true })
  await page.goto('/settings/audit')
  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()
  await page.goto('/review/demo-controls')
  await page.getByLabel('Fictional account').selectOption('system-administrator')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
      ),
    )
    .toBe('system-administrator')
  await page.goto('/settings/audit')
  await expect(page.getByText('profile.edit', { exact: true }).first()).toBeVisible()
  await page.goto('/review/demo-controls')
  await page.getByLabel('Fictional account').selectOption('')
  await page.goto('/staff/login')
  await page
    .getByLabel(/Username or email|Email or username|Email address/)
    .first()
    .fill('revised.officer@demo.pathways.local')
  await page.getByRole('textbox', { name: /^Password/ }).fill('PathwaysDemo!2026')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(page).toHaveURL(/dashboard/)
  expect(externalWrites).toEqual([])
})
