import { type Page, expect, test } from '@playwright/test'

const prototypePassword = 'PathwaysDemo!2026'

const seedPrototypeSession = async (page: Page, role = 'Project Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'p5-c5@demo.pathways.local',
        displayName: `${selectedRole} Demo`,
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

const seedBeneficiaryAccess = async (page: Page) => {
  await seedPrototypeSession(page)
  await page.addInitScript(() => {
    const now = new Date()
    window.sessionStorage.setItem(
      'pathways.beneficiaryAccess',
      JSON.stringify({
        role: 'Project Manager',
        verifiedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        token: 'p5-c5-beneficiary-access',
      }),
    )
  })
}

test.describe('P5-C5 controlled remediation', () => {
  test('demo-account selection closes, confirms, focuses, and continues the login flow', async ({
    page,
  }) => {
    await page.goto('/staff/login')
    await page.getByRole('button', { name: 'Demo Accounts' }).click()
    const chooser = page.getByRole('dialog', { name: 'Demo accounts' })
    await chooser.getByRole('button', { name: /Program Manager/ }).click()

    await expect(chooser).toBeHidden()
    await expect(
      page.getByText(/Selected Program Manager account \(program\.manager\)/),
    ).toBeVisible()
    const identifier = page.getByLabel('Username or email')
    await expect(identifier).toHaveValue('program.manager')
    await expect(page.locator('input[autocomplete="current-password"]')).toHaveValue(
      prototypePassword,
    )
    await expect(identifier).toBeFocused()

    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page.getByRole('heading', { name: 'OTP verification' })).toBeVisible()
  })

  test('project and beneficiary editors recover route-navigation drafts', async ({ page }) => {
    await seedBeneficiaryAccess(page)

    await page.goto('/projects/new')
    await page.getByLabel('Project title').fill('Recovered project draft')
    await page.getByRole('link', { name: 'Back to Projects' }).click()
    await expect(page).toHaveURL(/\/projects$/)
    await page.goto('/projects/new')
    await expect(page.getByText(/Recovered your unsaved project draft/)).toBeVisible()
    await expect(page.getByLabel('Project title')).toHaveValue('Recovered project draft')

    await page.goto('/beneficiaries/new')
    await page.getByLabel(/Beneficiary code/).fill('BEN-PROT-RECOVERY')
    await page.getByLabel(/Last name/).fill('Preserved')
    await page.getByRole('link', { name: 'Back to directory' }).click()
    await expect(page).toHaveURL(/\/beneficiaries$/)
    await page.goto('/beneficiaries/new')
    await expect(page.getByText(/Recovered your unsaved beneficiary draft/)).toBeVisible()
    await expect(page.getByLabel(/Beneficiary code/)).toHaveValue('BEN-PROT-RECOVERY')
    await expect(page.getByLabel(/Last name/)).toHaveValue('Preserved')
  })

  test('activity editor protects dismissals and recovers navigation drafts', async ({ page }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page)
    await page.goto('/projects/futuremakers-ncr/activities')

    await page.getByRole('button', { name: 'New Activity' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Create activity' })).toBeHidden()
    await expect(page.getByRole('dialog', { name: /Discard changes/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'New Activity' }).click()
    let editor = page.getByRole('dialog', { name: 'Create activity' })
    await editor.getByLabel(/Activity title/).fill('Protected activity draft')
    await editor.getByRole('button', { name: 'Cancel' }).click()

    let discard = page.getByRole('dialog', { name: 'Discard changes to this new activity?' })
    const stay = discard.getByRole('button', { name: 'Stay and keep editing' })
    await expect(stay).toBeFocused()
    await stay.click()
    await expect(editor.getByLabel(/Activity title/)).toHaveValue('Protected activity draft')

    await editor.getByRole('button', { name: 'Close' }).click()
    discard = page.getByRole('dialog', { name: 'Discard changes to this new activity?' })
    await discard.getByRole('button', { name: 'Stay and keep editing' }).click()
    await expect(editor.getByLabel(/Activity title/)).toHaveValue('Protected activity draft')

    await page.keyboard.press('Escape')
    discard = page.getByRole('dialog', { name: 'Discard changes to this new activity?' })
    await discard.getByRole('button', { name: 'Discard activity changes' }).click()
    await expect(editor).toBeHidden()

    await page.getByRole('button', { name: 'New Activity' }).click()
    editor = page.getByRole('dialog', { name: 'Create activity' })
    await editor.getByLabel(/Activity title/).fill('Activity draft across navigation')
    await page.goto('/projects')
    await page.goto('/projects/futuremakers-ncr/activities')
    await page.getByRole('button', { name: 'New Activity' }).click()
    editor = page.getByRole('dialog', { name: 'Create activity' })
    await expect(editor.getByText(/Recovered your unsaved activity draft/)).toBeVisible()
    await expect(editor.getByLabel(/Activity title/)).toHaveValue(
      'Activity draft across navigation',
    )
  })

  test('public-preview editor protects dirty exits and confirms project-wide restoration', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page, 'Program Manager')
    const previewPath = '/projects/futuremakers-ncr/transparency/preview'
    await page.goto(previewPath)

    await page.getByRole('button', { name: 'Edit staff preview' }).click()
    await page
      .getByRole('dialog', { name: 'Edit staff public-dashboard preview' })
      .getByRole('button', { name: 'Cancel' })
      .click()
    await expect(
      page.getByRole('dialog', { name: 'Edit staff public-dashboard preview' }),
    ).toBeHidden()

    await page.getByRole('button', { name: 'Edit staff preview' }).click()
    let editor = page.getByRole('dialog', { name: 'Edit staff public-dashboard preview' })
    await editor.getByLabel('Public headline').fill('Protected public preview draft')
    await page.keyboard.press('Escape')
    let discard = page.getByRole('dialog', { name: /Discard changes to FutureMakers NCR/ })
    const stay = discard.getByRole('button', { name: 'Stay and keep editing' })
    await expect(stay).toBeFocused()
    await stay.click()
    await expect(editor.getByLabel('Public headline')).toHaveValue('Protected public preview draft')

    await editor.getByRole('button', { name: 'Close' }).click()
    discard = page.getByRole('dialog', { name: /Discard changes to FutureMakers NCR/ })
    await discard.getByRole('button', { name: 'Stay and keep editing' }).click()
    await expect(editor.getByLabel('Public headline')).toHaveValue('Protected public preview draft')

    await page.goto('/projects/futuremakers-ncr/transparency')
    await page.goto(previewPath)
    await page.getByRole('button', { name: 'Edit staff preview' }).click()
    editor = page.getByRole('dialog', { name: 'Edit staff public-dashboard preview' })
    await expect(editor.getByText(/Recovered your unsaved public-preview draft/)).toBeVisible()
    await expect(editor.getByLabel('Public headline')).toHaveValue('Protected public preview draft')
    await editor.getByRole('button', { name: 'Save prototype view' }).click()
    await expect(page.getByText('Protected public preview draft')).toBeVisible()

    await page.getByRole('button', { name: 'Edit staff preview' }).click()
    editor = page.getByRole('dialog', { name: 'Edit staff public-dashboard preview' })
    await editor.getByRole('button', { name: 'Restore project defaults' }).click()
    let restore = page.getByRole('dialog', { name: 'Restore defaults for FutureMakers NCR?' })
    await expect(restore.getByText(/Affected scope: public story copy/)).toBeVisible()
    await expect(restore.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await restore.getByRole('button', { name: 'Cancel' }).click()
    await expect(editor.getByLabel('Public headline')).toHaveValue('Protected public preview draft')

    await editor.getByRole('button', { name: 'Restore project defaults' }).click()
    restore = page.getByRole('dialog', { name: 'Restore defaults for FutureMakers NCR?' })
    await restore.getByRole('button', { name: 'Restore project defaults' }).click()
    await expect(editor).toBeHidden()
    await expect(page.getByText('Protected public preview draft')).toHaveCount(0)
  })

  test('collection deletion and label restoration identify scope and preserve Cancel', async ({
    page,
  }) => {
    await seedPrototypeSession(page, 'System Administrator')
    await page.goto('/collection/forms/new')

    await page.getByRole('button', { name: 'Delete Age group' }).click()
    let deletion = page.getByRole('dialog', { name: 'Delete Age group?' })
    await expect(deletion.getByText(/Field code: beneficiary_age_group/)).toBeVisible()
    await expect(deletion.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await deletion.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Delete Age group' })).toBeVisible()

    await page.getByRole('button', { name: 'Delete Age group' }).click()
    deletion = page.getByRole('dialog', { name: 'Delete Age group?' })
    await deletion.getByRole('button', { name: 'Delete Age group' }).click()
    await expect(page.getByRole('button', { name: 'Delete Age group' })).toHaveCount(0)
    await expect(page.locator('#collection-field-choice-field-beneficiary-id')).toBeFocused()

    await page.goto('/settings/labels')
    const projectsHeading = page.getByLabel('Projects page heading')
    await projectsHeading.fill('Custom Projects Heading')
    await page.getByRole('button', { name: 'Save headings' }).click()
    await page.getByRole('button', { name: 'Restore defaults' }).click()
    let restore = page.getByRole('dialog', { name: 'Restore default page headings?' })
    await expect(restore.getByText(/Affected scope: every editable dashboard/)).toBeVisible()
    await expect(restore.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await restore.getByRole('button', { name: 'Cancel' }).click()
    await expect(projectsHeading).toHaveValue('Custom Projects Heading')

    await page.getByRole('button', { name: 'Restore defaults' }).click()
    restore = page.getByRole('dialog', { name: 'Restore default page headings?' })
    await restore.getByRole('button', { name: 'Restore all heading defaults' }).click()
    await expect(projectsHeading).toHaveValue('Project Information Management')
  })
})
