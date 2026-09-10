import { type Page, expect, test } from '@playwright/test'

const roleAccounts = [
  ['program-manager', 'Program Manager'],
  ['grant-manager', 'Grant Manager'],
  ['project-manager', 'Project Manager'],
  ['monitoring-evaluation-officer', 'Monitoring and Evaluation Officer'],
  ['project-officer', 'Project Officer'],
  ['system-administrator', 'System Administrator'],
] as const

const removedDisclosure =
  /demo data|prototype-only|browser-local|local revision|frontend preview|role preview|no server|not connected/i

async function switchAccount(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  await page.getByLabel('Fictional account').selectOption(accountId)
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
      ),
    )
    .toBe(accountId)
}

test('ordinary role dashboards and the public tracker use formal production copy', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 900 })

  for (const [accountId, roleLabel] of roleAccounts) {
    await switchAccount(page, accountId)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1, name: roleLabel })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(removedDisclosure)
  }

  await page.goto('/review/demo-controls')
  await page.getByLabel('Fictional account').selectOption('')
  await page.goto('/public/projects')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(removedDisclosure)
})

test('metric context is available on hover, focus, and touch-sized click without overflow', async ({
  page,
}) => {
  await switchAccount(page, 'program-manager')
  await page.goto('/dashboard')

  const trigger = page.getByRole('button', { name: 'More information about Budget utilization' })
  const description = /verified against/
  await expect(page.getByText(description)).toHaveCount(0)

  await trigger.hover()
  await expect(page.getByRole('tooltip')).toContainText(description)
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await trigger.focus()
  await expect(page.getByRole('tooltip')).toContainText(description)
  await trigger.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await expect(page.getByRole('tooltip')).toContainText(description)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})
