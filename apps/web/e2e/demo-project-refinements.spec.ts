import { type Page, expect, test } from '@playwright/test'

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

async function resetAndSwitch(page: Page, accountId: string) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await page.getByLabel('Fictional account').selectOption(accountId)
}

test('project team reassignment is scoped, persists, and is hidden from disallowed roles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await resetAndSwitch(page, 'project-manager')
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
    const manager = state.accounts?.find(
      (account: { id: string }) => account.id === 'project-manager',
    )
    if (manager) manager.projectIds = []
    state.teamScopeVersion = undefined
    localStorage.setItem('pathways.demo.v1', JSON.stringify(state))
  })
  await page.goto('/projects/futuremakers-ncr')

  await page.getByRole('button', { name: 'Edit team' }).click()
  await expect(page.getByRole('heading', { name: 'Edit project team' })).toBeVisible()
  const projectManagerField = page.getByRole('combobox', { name: /^Project Manager/ })
  await expect(projectManagerField).toContainText('Project Manager A')
  await expect(projectManagerField).not.toContainText('@existing.demo.pathways.local')
  await page.getByRole('combobox', { name: /^Monitoring and Evaluation Officer/ }).click()
  await page.getByRole('option', { name: /^Monitoring Officer Demo/ }).click()
  await page.getByRole('button', { name: 'Save assignments' }).click()

  await expect(page.getByText('Project team assignments updated.')).toBeVisible()
  await expect(page.getByText('Monitoring Officer Demo', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'FutureMakers NCR' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Monitoring Officer Demo', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'FutureMakers NCR' })).toBeVisible()

  for (const accountId of ['grant-manager', 'program-manager', 'system-administrator']) {
    await switchAccount(page, accountId)
    await page.goto('/projects/futuremakers-ncr')
    await expect(
      page.getByRole('button', { name: 'Edit team' }),
      `${accountId} should be able to edit the project team`,
    ).toBeVisible()
  }

  for (const accountId of ['monitoring-evaluation-officer', 'project-officer']) {
    await switchAccount(page, accountId)
    await page.goto('/projects/futuremakers-ncr')
    await expect(page.getByRole('button', { name: 'Edit team' })).toHaveCount(0)
  }
})

test('create-project omits Budget code and activities use the requested dropdown', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects/new')
  await expect(page.getByLabel('Budget code')).toHaveCount(0)
  await expect(page.getByLabel('Project budget (PHP)')).toBeVisible()

  await page.goto('/projects/futuremakers-ncr/activities')
  const activityList = page.getByRole('combobox', { name: 'Activity List' })
  const search = page.getByRole('textbox', { name: 'Search activities' })
  const newActivity = page.getByRole('button', { name: 'New Activity' })
  await expect(activityList).toBeVisible()
  await expect(newActivity).toBeVisible()
  const searchBox = await search.boundingBox()
  const activityListBox = await activityList.boundingBox()
  const newActivityBox = await newActivity.boundingBox()
  expect(searchBox).not.toBeNull()
  expect(activityListBox).not.toBeNull()
  expect(newActivityBox).not.toBeNull()
  expect((activityListBox?.x ?? 0) >= (searchBox?.x ?? 0) + (searchBox?.width ?? 0)).toBe(true)
  expect((newActivityBox?.y ?? 0) >= (searchBox?.y ?? 0) + (searchBox?.height ?? 0)).toBe(true)
  await activityList.click()
  for (const option of ['All', 'Mine', 'Overdue', 'Needs Attention']) {
    await expect(page.getByRole('option', { name: option, exact: true })).toBeVisible()
  }
  await page.getByRole('option', { name: 'Overdue', exact: true }).click()
  await expect(activityList).toHaveText('Overdue')
})

test('activity status summary filters the activity list for every status', async ({ page }) => {
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/activities')

  const summary = page.getByRole('region', { name: 'Activity status summary' })
  const activities = page.getByRole('article', { name: /^Activity:/ })
  for (const status of ['Planned', 'In Progress', 'For Review', 'Overdue', 'Completed']) {
    const statusFilter = summary.getByRole('button', {
      name: new RegExp(`^Filter activities by ${status} status`),
    })
    const label = await statusFilter.getAttribute('aria-label')
    const expectedCount = Number(label?.split(', ')[1]?.split(' ')[0])
    expect(Number.isFinite(expectedCount)).toBe(true)
    await statusFilter.click()
    await expect(statusFilter).toHaveAttribute('aria-pressed', 'true')
    await expect(activities).toHaveCount(expectedCount)
  }

  await page.getByRole('combobox', { name: 'Activity List' }).click()
  await page.getByRole('option', { name: 'Needs Attention', exact: true }).click()
  await expect(summary.getByRole('button', { pressed: true })).toHaveCount(0)
})

test('public project section controls are separated and responsive', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await resetAndSwitch(page, 'project-manager')
  await page.goto('/projects/futuremakers-ncr/transparency')

  const visibilityControls = page.getByRole('switch', { name: /^Public visibility for/ })
  await expect(visibilityControls).toHaveCount(3)
  const firstVisibility = visibilityControls.first()
  const initialVisibility = await firstVisibility.getAttribute('aria-checked')
  await firstVisibility.click()
  await expect(firstVisibility).toHaveAttribute(
    'aria-checked',
    initialVisibility === 'true' ? 'false' : 'true',
  )

  const firstDraft = page.getByRole('button', { name: 'Draft', exact: true }).first()
  await firstDraft.click()
  await expect(firstDraft).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /^(Visible|Hidden)$/ })).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
})
