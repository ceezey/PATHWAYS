import { type Page, expect, test } from '@playwright/test'

async function resetAsProjectManager(page: Page) {
  await page.goto('/review/demo-controls')
  await expect(page.getByRole('status')).toContainText('Review controls ready.', {
    timeout: 20_000,
  })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset review data' }).click()
  await page.getByLabel('Fictional account').selectOption('project-manager')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}').session?.accountId,
      ),
    )
    .toBe('project-manager')
  await page.evaluate(() => sessionStorage.clear())
}

test('authorized activity forms expose and persist the five requested statuses', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await resetAsProjectManager(page)
  await page.goto('/projects/futuremakers-ncr/activities')

  await page.getByRole('button', { name: 'New Activity' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create activity' })
  const createStatus = createDialog.getByRole('combobox', { name: 'Activity status' })
  await expect(createStatus).toContainText('Planned')
  await createStatus.click()
  for (const status of ['Planned', 'In Progress', 'For Review', 'Overdue', 'Completed']) {
    await expect(page.getByRole('option', { name: status, exact: true })).toBeVisible()
  }
  await page.getByRole('option', { name: 'For Review', exact: true }).click()
  await createDialog.getByLabel(/Activity title/).fill('Status-selectable activity')
  await createDialog
    .getByLabel(/Description/)
    .fill('Verifies that an authorized user can select a status while adding an activity.')
  await createDialog.getByLabel(/Start date/).fill('2026-09-10')
  await createDialog.getByLabel(/Due date/).fill('2026-09-20')
  await createDialog
    .getByRole('group', { name: /Assigned officers/ })
    .getByRole('checkbox')
    .first()
    .check()
  await createDialog
    .getByRole('group', { name: /Connected indicators/ })
    .getByRole('checkbox')
    .first()
    .check()
  await createDialog.getByRole('combobox', { name: 'Journey stage' }).click()
  await page.getByRole('option', { name: /J1/ }).first().click()
  await createDialog.getByRole('button', { name: 'Create Activity' }).click()
  await expect(createDialog).toBeHidden()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
        return state.activities.find(
          (row: { title: string }) => row.title === 'Status-selectable activity',
        )?.status
      }),
    )
    .toBe('For Review')
  await page
    .getByRole('dialog', { name: 'Status-selectable activity' })
    .getByRole('button', { name: 'Close' })
    .click()

  const activity = page.getByRole('article', {
    name: 'Activity: Run cohort orientation and baseline profiling',
  })
  await activity.getByRole('button', { name: 'View details' }).click()
  const panel = page.getByRole('dialog', {
    name: 'Run cohort orientation and baseline profiling',
  })
  await panel.getByRole('button', { name: 'Edit activity' }).click()

  const editDialog = page.getByRole('dialog', { name: 'Edit activity' })
  const editStatus = editDialog.getByRole('combobox', { name: 'Activity status' })
  await expect(editStatus).toContainText('Completed')
  await editStatus.click()
  await page.getByRole('option', { name: 'In Progress', exact: true }).click()
  await editDialog
    .getByRole('group', { name: /Assigned officers/ })
    .getByRole('checkbox')
    .first()
    .check()
  await editStatus.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('activity-status-edit-form.png'),
  })
  await editDialog.getByRole('button', { name: 'Save Activity' }).click()
  await expect(editDialog).toBeHidden()
  await expect(panel.getByText('In Progress activity detail')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('pathways.demo.v1') ?? '{}')
        return state.activities.find((row: { id: string }) => row.id === 'act-fm-01')?.status
      }),
    )
    .toBe('In Progress')

  expect(runtimeErrors).toEqual([])
})
