import { type Locator, type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page, role = 'Project Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'p5-c4@demo.pathways.local',
        displayName: `${selectedRole} Demo`,
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

const seedBeneficiaryAccess = async (page: Page) => {
  await seedPrototypeSession(page, 'Project Manager')
  await page.addInitScript(() => {
    const now = new Date()
    window.sessionStorage.setItem(
      'pathways.beneficiaryAccess',
      JSON.stringify({
        role: 'Project Manager',
        verifiedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        token: 'p5-c4-beneficiary-access',
      }),
    )
  })
}

const expectOwnedError = async (control: Locator, message: string) => {
  await expect(control).toHaveAttribute('aria-invalid', 'true')
  const errorIds = (await control.getAttribute('aria-describedby'))?.split(/\s+/) ?? []
  expect(errorIds.length).toBeGreaterThan(0)
  await expect(control.page().locator(errorIds.map((id) => `#${id}`).join(','))).toContainText(
    message,
  )
}

const chooseSelectOption = async (page: Page, label: string, option: string) => {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

const expectSinglePressedChoice = async (scope: Locator) => {
  const choices = scope.locator('button[aria-pressed]')
  await expect(choices.first()).toBeVisible()
  expect(
    await choices.evaluateAll(
      (items) => items.filter((item) => item.getAttribute('aria-pressed') === 'true').length,
    ),
  ).toBe(1)

  const previousIndex = await choices.evaluateAll((items) =>
    items.findIndex((item) => item.getAttribute('aria-pressed') === 'true'),
  )
  const previous = choices.nth(previousIndex)
  await expect(previous.getByText('Selected', { exact: true })).toBeVisible()
  const next = choices.nth(previousIndex === 0 ? 1 : 0)
  await next.click()
  await expect(previous).toHaveAttribute('aria-pressed', 'false')
  await expect(next).toHaveAttribute('aria-pressed', 'true')
  await expect(next.getByText('Selected', { exact: true })).toBeVisible()
}

test.describe('P5-C4 controlled remediation', () => {
  test('project workspaces expose overview/current navigation and radio filter behavior', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page)
    await page.goto('/projects/futuremakers-ncr/activities')

    const workspaceNav = page.getByRole('navigation', { name: 'Project Workspace' })
    await expect(workspaceNav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/projects/futuremakers-ncr',
    )
    await expect(workspaceNav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(workspaceNav.getByRole('link', { name: 'Activities' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    const activityFilters = page.getByRole('radiogroup', { name: 'Activity status filter' })
    const allActivities = activityFilters.getByRole('radio', { name: 'All' })
    await expect(allActivities).toBeChecked()
    await allActivities.focus()
    await page.keyboard.press('ArrowRight')
    await expect(activityFilters.getByRole('radio', { name: 'Mine' })).toBeChecked()
    await expect(page.getByRole('status')).toContainText(/activit(y|ies) match/)

    await workspaceNav.getByRole('link', { name: 'Overview' }).click()
    await expect(page).toHaveURL(/\/projects\/futuremakers-ncr$/)
    const overviewNav = page.getByRole('navigation', { name: 'Project Workspace' })
    await expect(overviewNav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(overviewNav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.goto('/projects')
    const projectFilters = page.getByRole('radiogroup', { name: 'Project status filter' })
    const allProjects = projectFilters.getByRole('radio', { name: 'All' })
    await allProjects.focus()
    await page.keyboard.press('ArrowRight')
    await expect(projectFilters.getByRole('radio', { name: 'Active' })).toBeChecked()
    await expect(page.getByRole('status')).toContainText(/projects? match/)
  })

  test('beneficiary submission exposes complete associated errors and preserves entered data', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedBeneficiaryAccess(page)
    await page.goto('/beneficiaries/new')

    const firstName = page.getByLabel(/First name/)
    await firstName.fill('Safe Entry')
    await page.getByLabel('Beneficiary is a minor').check()
    await firstName.press('Enter')

    const summary = page.getByRole('alert', { name: 'Check 12 fields before saving' })
    await expect(summary).toContainText('Check 12 fields before saving')
    await expect(summary.locator('li')).toHaveCount(12)
    const code = page.getByLabel(/Beneficiary code/)
    await expect(code).toBeFocused()
    await expectOwnedError(code, 'Enter a beneficiary code beyond BEN-PROT-.')
    await expectOwnedError(
      page.getByRole('combobox', { name: /Project enrollment/ }),
      'Select a project enrollment.',
    )
    await expectOwnedError(
      page.getByLabel(/Beneficiary consent confirmed/),
      'Confirm beneficiary consent to participate.',
    )
    await expectOwnedError(
      page.getByLabel(/Guardian consent confirmed/),
      'Confirm guardian consent for a beneficiary marked as a minor.',
    )
    await expect(firstName).toHaveValue('Safe Entry')
  })

  test('clear all resets search, six filters, and the default action state', async ({ page }) => {
    test.setTimeout(120_000)
    await seedBeneficiaryAccess(page)
    await page.goto('/beneficiaries')

    const clear = page.getByRole('button', { name: 'Clear all filters' })
    await expect(clear).toBeDisabled()
    await page.getByLabel('Search by name or code').fill('BEN')
    await chooseSelectOption(page, 'Project', 'FutureMakers NCR')
    await chooseSelectOption(page, 'Location', 'Quezon City')
    await chooseSelectOption(page, 'Sex', 'Female')
    await chooseSelectOption(page, 'Age group', '18-24')
    await chooseSelectOption(page, 'Disability status', 'Without disability')
    await chooseSelectOption(page, 'Enrollment status', 'Active')
    await expect(clear).toBeEnabled()

    await clear.click()
    await expect(page.getByLabel('Search by name or code')).toHaveValue('')
    for (const [label, value] of [
      ['Project', 'All projects'],
      ['Location', 'All locations'],
      ['Sex', 'All sex values'],
      ['Age group', 'All age groups'],
      ['Disability status', 'All statuses'],
      ['Enrollment status', 'All enrollment statuses'],
    ] as const) {
      await expect(page.getByRole('combobox', { name: label })).toContainText(value)
    }
    await expect(page.getByText(/Page 1 of/)).toBeVisible()
    await expect(clear).toBeDisabled()
  })

  test('activity create/edit uses only project-scoped relationship options', async ({ page }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page)
    await page.goto('/projects/futuremakers-ncr/activities')
    await page.getByRole('button', { name: 'New Activity' }).click()

    const createDialog = page.getByRole('dialog', { name: 'Create activity' })
    await expect(createDialog.getByRole('group', { name: /Assigned officers/ })).toBeVisible()
    await expect(createDialog.getByRole('checkbox', { name: /Project Officer A/ })).toHaveCount(1)
    await expect(
      createDialog.getByRole('checkbox', { name: /Project Officer Invite/ }),
    ).toHaveCount(0)
    await expect(createDialog.getByRole('checkbox', { name: /FM-ORIENTED/ })).toHaveCount(1)
    await expect(createDialog.getByRole('checkbox', { name: /YR-SITES/ })).toHaveCount(0)

    await createDialog.getByLabel(/Activity title/).fill('Scoped activity test')
    await createDialog
      .getByLabel(/Description/)
      .fill('A project-scoped activity created by the focused browser acceptance test.')
    await createDialog.getByLabel(/Start date/).fill('2026-09-10')
    await createDialog.getByLabel(/Due date/).fill('2026-09-20')
    await createDialog.getByRole('checkbox', { name: /Project Officer A/ }).check()
    await createDialog.getByRole('checkbox', { name: /FM-ORIENTED/ }).check()
    await createDialog.getByRole('combobox', { name: /Journey stage/ }).click()
    await page.getByRole('option', { name: /J1 — Registration and intake/ }).click()
    await createDialog.getByRole('button', { name: 'Create Activity' }).click()
    await expect(page.getByText('Scoped activity test', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit activity' })
    await expect(editDialog.getByRole('checkbox', { name: /Project Officer A/ })).toBeChecked()
    await expect(editDialog.getByRole('checkbox', { name: /FM-ORIENTED/ })).toBeChecked()
    await expect(editDialog.getByRole('combobox', { name: /Journey stage/ })).not.toHaveText('')
  })

  test('all canonical selectable and report surfaces expose one updating non-color state', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await seedPrototypeSession(page, 'System Administrator')

    await page.goto('/alerts')
    await expectSinglePressedChoice(
      page.getByRole('heading', { name: 'Alert queue' }).locator('..'),
    )

    await page.goto('/recommendations')
    await expectSinglePressedChoice(
      page.getByRole('heading', { name: 'Recommendation queue' }).locator('..'),
    )

    await page.goto('/alerts/repository')
    await expectSinglePressedChoice(
      page
        .getByRole('heading', { name: /rules configured/ })
        .locator('..')
        .locator('..'),
    )

    await page.goto('/collection/forms/new')
    await expectSinglePressedChoice(
      page
        .getByRole('heading', { name: 'Form field list' })
        .locator('..')
        .locator('..')
        .locator('..'),
    )

    await page.goto('/reports/project-summary')
    const reportNav = page.getByRole('navigation', { name: 'Report sections' })
    await expect(reportNav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(reportNav.getByRole('link', { name: /Project Summary Current/ })).toBeVisible()
    await reportNav.getByRole('link', { name: 'Indicator Summary' }).click()
    await expect(page).toHaveURL(/\/reports\/indicator-summary$/)
    const updatedReportNav = page.getByRole('navigation', { name: 'Report sections' })
    await expect(updatedReportNav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(
      updatedReportNav.getByRole('link', { name: /Indicator Summary Current/ }),
    ).toHaveAttribute('aria-current', 'page')
  })
})
