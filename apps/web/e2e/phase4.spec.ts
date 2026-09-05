import { type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page, role: string) => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        displayName: `${selectedRole} Demo`,
        email: 'phase4@demo.pathways.local',
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

test.describe('Phase 4 approved staff workflows', () => {
  test('Project Team uses active controlled selectors and preserves the creation payload', async ({
    page,
  }) => {
    await seedPrototypeSession(page, 'Project Manager')
    await page.goto('/projects/new')

    await expect(page.getByText('Loading active team members...')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /Program Manager/ })).toHaveCount(0)

    await page.getByRole('textbox', { name: /Project title/ }).fill('Phase Four Team Test')
    await page.getByRole('textbox', { name: /Sector/ }).fill('Education')
    await page.getByRole('textbox', { name: /Implementation area/ }).fill('Metro Manila')
    await page.getByRole('textbox', { name: /Budget code/ }).fill('P4-TEAM-001')
    await page.getByLabel(/Start date/).fill('2026-09-01')
    await page.getByLabel(/End date/).fill('2026-12-01')
    await page
      .getByRole('textbox', { name: /Description/ })
      .fill('Controlled Project Team selector validation record.')
    await page.getByRole('button', { name: 'Create Project' }).click()
    await expect(page.getByText('Select the Program Manager.')).toBeVisible()
    await expect(page.getByRole('combobox', { name: /^Program Manager/ })).toBeFocused()

    for (const [label, option] of [
      ['Program Manager', 'Program Manager A'],
      ['Project Manager', 'Project Manager A'],
      ['Monitoring and Evaluation Officer', 'Monitoring and Evaluation Officer A'],
    ] as const) {
      await page.getByRole('combobox', { name: new RegExp(`^${label}`) }).click()
      await page.getByRole('option', { name: new RegExp(`^${option}`) }).click()
    }

    const projectOfficers = page.getByRole('button', { name: /^Project Officers/ })
    await projectOfficers.click()
    await expect(
      page.getByRole('menuitemcheckbox', { name: /Project Officer Invite/ }),
    ).toHaveCount(0)
    await page.getByRole('menuitemcheckbox', { name: /Project Officer A/ }).click()
    await page.keyboard.press('Escape')
    await expect(projectOfficers).toBeFocused()
    await expect(page.getByRole('button', { name: 'Remove Project Officer A' })).toBeVisible()
    await page.getByRole('button', { name: 'Create Project' }).click()

    await expect(page).toHaveURL(/\/projects\/prototype-phase-four-team-test-/)
    const created = await page.evaluate(() => {
      const projects = JSON.parse(
        window.localStorage.getItem('pathways.prototypeProjects') ?? '[]',
      ) as Array<Record<string, unknown>>
      return projects.find((project) => project.title === 'Phase Four Team Test')
    })
    expect(created).toMatchObject({
      monitoringOfficer: 'Monitoring and Evaluation Officer A',
      programManager: 'Program Manager A',
      projectManager: 'Project Manager A',
      projectOfficers: ['Project Officer A'],
    })
  })

  test('Modify budget cancels safely, persists planned allocation, and recomputes derived values', async ({
    page,
  }) => {
    await seedPrototypeSession(page, 'Project Manager')
    await page.goto('/projects/futuremakers-ncr/budget')

    const action = page.getByRole('button', { name: 'Modify budget' })
    await expect(action).toBeVisible()
    await action.click()
    await page.getByLabel(/Planned allocation/).fill('2000000')
    await expect(page.getByText(/remaining balance will be negative/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(action).toBeFocused()
    await expect(page.getByText('₱4,200,000')).toBeVisible()
    expect(
      await page.evaluate(() => window.localStorage.getItem('pathways.prototypeBudgets')),
    ).toBe(null)

    await action.click()
    await page.getByLabel(/Planned allocation/).fill('4500000')
    await page.getByRole('button', { name: 'Save budget' }).click()
    await expect(action).toBeFocused()
    await expect(page.getByText('₱4,500,000')).toBeVisible()
    await expect(page.getByText('₱1,938,000')).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Utilization' })).toHaveAttribute(
      'aria-valuenow',
      '57',
    )

    const stored = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('pathways.prototypeBudgets') ?? '[]'),
    )
    expect(stored).toEqual([{ plannedAmount: 4_500_000, projectId: 'futuremakers-ncr' }])
  })

  test('activity status updates one record and synchronizes counts, filters, and search', async ({
    page,
  }) => {
    await seedPrototypeSession(page, 'Project Manager')
    await page.goto('/projects/futuremakers-ncr/activities')

    const title = 'Deliver skills bootcamp sessions'
    const statusControl = page.getByRole('combobox', {
      name: `Change status for ${title}. Current status: In Progress`,
    })
    await statusControl.click()
    await page.getByRole('option', { name: 'Completed', exact: true }).click()

    const summary = page.getByRole('region', { name: 'Activity status summary' })
    await expect(summary.getByText('Completed').locator('..').getByText('2')).toBeVisible()
    await expect(summary.getByText('In Progress').locator('..').getByText('0')).toBeVisible()
    await expect(
      page.getByRole('combobox', {
        name: `Change status for ${title}. Current status: Completed`,
      }),
    ).toBeFocused()

    const storedActivity = await page.evaluate(() => {
      const activities = JSON.parse(
        window.localStorage.getItem('pathways.prototypeActivities') ?? '[]',
      ) as Array<Record<string, unknown>>
      return activities.find((activity) => activity.id === 'act-fm-02')
    })
    expect(storedActivity).toMatchObject({
      beneficiariesReached: 268,
      dueDate: '2026-08-30',
      progress: 64,
      status: 'Completed',
    })

    const statusFilter = page.getByRole('radiogroup', { name: 'Activity status filter' })
    await statusFilter.getByText('Overdue', { exact: true }).click()
    await expect(page.getByRole('article', { name: `Activity: ${title}` })).toHaveCount(0)
    await statusFilter.getByText('All', { exact: true }).click()
    await page.getByRole('textbox', { name: 'Search activities' }).fill(title)
    const result = page.getByRole('article', { name: `Activity: ${title}` })
    await expect(result).toBeVisible()
    await expect(
      result.getByRole('combobox', {
        name: `Change status for ${title}. Current status: Completed`,
      }),
    ).toBeVisible()
  })

  test('non-editing activity roles retain static status text', async ({ page }) => {
    await seedPrototypeSession(page, 'Monitoring and Evaluation Officer')
    await page.goto('/projects/futuremakers-ncr/activities')

    await expect(page.getByRole('combobox', { name: /Change status for/ })).toHaveCount(0)
    await expect(page.getByText('In Progress').first()).toBeVisible()

    await page.goto('/projects/futuremakers-ncr/budget')
    await expect(page.getByRole('button', { name: 'Modify budget' })).toHaveCount(0)
  })

  test('staff feature surfaces remain contained at mobile, tablet, and desktop widths', async ({
    page,
  }) => {
    await seedPrototypeSession(page, 'Project Manager')

    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ height: 800, width })
      await page.goto('/projects/futuremakers-ncr/activities')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0)
      await expect(page.getByRole('textbox', { name: 'Search activities' })).toBeVisible()
    }
  })
})
