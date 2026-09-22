import { type Locator, type Page, expect, test } from '@playwright/test'

async function switchAccount(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', {
    timeout: 20_000,
  })
  await page.getByLabel('Fictional account').selectOption(accountId)
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
      ),
    )
    .toBe(accountId)
}

async function resetAndSwitch(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', {
    timeout: 20_000,
  })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await switchAccount(page, accountId)
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  if (!value) throw new Error('Expected the inspected control to have a visible bounding box.')
  return value
}

test('post-handoff UI corrections preserve actions while relocating the requested controls', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await resetAndSwitch(page, 'project-officer')
  await page.goto('/projects')
  await expect(page.getByRole('button', { name: /Edit .* page heading/ })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('all-role-header-editor.png'),
  })

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr')
  await expect(page.getByRole('link', { name: 'Open Activities' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit project profile' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive project' })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('project-overview-actions.png'),
  })

  await page.goto('/projects/futuremakers-ncr/activities')
  const status = page.getByRole('button', { name: /Planned status/ })
  const search = page.getByRole('textbox', { name: 'Search activities' })
  const list = page.getByRole('button', { name: 'List view' })
  const board = page.getByRole('button', { name: 'Board view' })
  const [statusBox, searchBox, listBox, boardBox] = await Promise.all([
    box(status),
    box(search),
    box(list),
    box(board),
  ])
  expect(statusBox.x + statusBox.width + 20).toBeLessThan(searchBox.x)
  expect(Math.abs(statusBox.y - searchBox.y)).toBeLessThan(20)
  expect(listBox.x).toBeLessThan(boardBox.x)
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('activity-toolbar.png'),
  })

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/indicators')
  const indicatorSearch = page.getByRole('searchbox', { name: 'Search indicators' })
  const addIndicator = page.getByRole('button', { name: 'Add indicator' })
  await expect(page.getByText('Search indicators', { exact: true })).toHaveCount(0)
  const [indicatorSearchBox, addIndicatorBox] = await Promise.all([
    box(indicatorSearch),
    box(addIndicator),
  ])
  expect(indicatorSearchBox.x).toBeLessThan(addIndicatorBox.x)
  expect(Math.abs(indicatorSearchBox.y - addIndicatorBox.y)).toBeLessThan(8)
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('indicator-toolbar.png'),
  })

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/journey-stages')
  const stageListHeading = page.getByRole('heading', { name: 'Stage list' })
  const stageDetailsHeading = page.getByRole('heading', { name: 'Stage details' })
  const addStage = page.getByRole('button', { name: 'Add stage' })
  const saveStages = page.getByRole('button', { name: 'Save configuration' })
  const [stageListBox, stageDetailsBox, addStageBox, saveStagesBox] = await Promise.all([
    box(stageListHeading),
    box(stageDetailsHeading),
    box(addStage),
    box(saveStages),
  ])
  expect(addStageBox.x).toBeGreaterThan(stageListBox.x + stageListBox.width)
  expect(saveStagesBox.x).toBeLessThan(stageDetailsBox.x)
  expect(Math.abs(addStageBox.y - stageListBox.y)).toBeLessThan(12)
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('indicator-and-stage-layouts.png'),
  })

  await switchAccount(page, 'system-administrator')
  await page.goto('/alerts/repository')
  await expect(page.getByRole('tab', { name: 'Create rule' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create rule' })).toHaveCount(1)
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('alerts-repository.png'),
  })

  await switchAccount(page, 'project-officer')
  await page.goto('/beneficiaries/ben-001')
  const gate = page.getByRole('dialog', { name: 'Verify beneficiary module access' })
  await gate.getByLabel('Beneficiary access PIN').fill('2468')
  await gate.getByRole('button', { name: 'Verify and enter' }).click()
  await expect(gate).toBeHidden()
  await expect(page.getByRole('button', { name: 'Relock beneficiary records' })).toHaveCount(0)
  await page.getByRole('button', { name: /J3.*Skills bootcamp branch/i }).click()
  for (const name of ['Record participation', 'View assessment', 'Add note']) {
    const action = page.getByRole('button', { name })
    await expect(action).toBeVisible()
    expect((await action.textContent())?.trim()).toBe('')
  }
  const detailHeading = page.getByRole('heading', { name: /Skills bootcamp branch/ })
  const record = page.getByRole('button', { name: 'Record participation' })
  const [detailHeadingBox, recordBox] = await Promise.all([box(detailHeading), box(record)])
  expect(recordBox.x).toBeGreaterThan(detailHeadingBox.x + detailHeadingBox.width)
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('beneficiary-journey-actions.png'),
  })

  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ['/beneficiaries/ben-001', '/projects/futuremakers-ncr/activities']) {
    await page.goto(route)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
  }

  await switchAccount(page, 'monitoring-evaluation-officer')
  await page.goto('/projects/futuremakers-ncr/indicators')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)

  await switchAccount(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/journey-stages')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)

  await switchAccount(page, 'system-administrator')
  await page.goto('/alerts/repository')
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)

  expect(runtimeErrors).toEqual([])
})
