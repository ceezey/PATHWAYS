import { type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'p5-c3@demo.pathways.local',
        displayName: 'Program Manager Demo',
        role: 'Program Manager',
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', 'Program Manager')
  })
}

const uploadCsv = async (page: Page, name: string, contents: string) => {
  await page.getByLabel('Source file').setInputFiles({
    buffer: Buffer.from(contents),
    mimeType: 'text/csv',
    name,
  })
}

test.describe('P5-C3 controlled remediation', () => {
  test.beforeEach(async ({ page }) => {
    await seedPrototypeSession(page)
    await page.goto('/collection/import')
  })

  test('invalid and unmapped files cannot proceed, while resolved mappings can', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    await uploadCsv(page, 'invalid.csv', ',beneficiary_id\nvalue,BEN-001')
    await expect(page.locator('output[data-import-status="ready"]')).toContainText(
      'Preview ready for invalid.csv',
    )
    await expect(
      page.getByText('1 invalid source column remains. Resolve them before proceeding.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Proceed' })).toBeDisabled()

    await uploadCsv(page, 'unmapped.csv', 'beneficiary_id,unknown_column\nBEN-001,value')
    await expect(
      page.getByText('1 unmapped source column remains. Resolve them before proceeding.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Proceed' })).toBeDisabled()

    await uploadCsv(page, 'valid.csv', 'beneficiary_id,attendance_status\nBEN-001,Present')
    await expect(
      page.getByText('All 2 source columns are resolved. You can proceed.'),
    ).toBeVisible()
    const proceed = page.getByRole('button', { name: 'Proceed' })
    await expect(proceed).toBeEnabled()
    await proceed.click()

    const dialog = page.getByRole('dialog', { name: 'Review mapped fields?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Proceed' }).click()
    await expect(
      page.getByText('Import mapping marked ready for future production validation.'),
    ).toBeVisible()
  })

  test('chooser and import status support keyboard focus, retained recovery, and retry', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    const chooser = page.getByLabel('Source file')
    await expect(page.locator('input[type="file"]')).toHaveCount(1)
    await expect(chooser).toBeVisible()
    await expect(chooser).toHaveAccessibleName('Source file')
    await expect(chooser).toHaveAttribute('aria-describedby', 'collection-import-file-help')
    await expect(page.locator('#collection-import-file-help')).toContainText(
      'read locally in this browser',
    )

    await chooser.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(chooser).toBeFocused()

    await uploadCsv(page, 'baseline.csv', 'beneficiary_id\nBEN-001')
    await expect(page.locator('output[data-import-status="ready"]')).toContainText(
      'Preview ready for baseline.csv',
    )
    await expect(page.getByRole('progressbar', { name: 'File reading progress' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
    await expect(page.getByText('BEN-001')).toBeVisible()

    await chooser.focus()
    await chooser.setInputFiles({
      buffer: Buffer.from('unsupported'),
      mimeType: 'text/plain',
      name: 'unsupported.txt',
    })
    const errorStatus = page.locator('output[data-import-status="error"]')
    await expect(errorStatus).toContainText('Choose a CSV, XLS, or XLSX file')
    await expect(errorStatus).toContainText('previous preview and mapping work are retained')
    await expect(chooser).toBeFocused()
    await expect(page.getByText('BEN-001')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Proceed' })).toBeDisabled()

    const retry = page.getByRole('button', { name: 'Retry reading file' })
    await retry.click()
    await expect(errorStatus).toContainText('Retry or choose a different file')
    await expect(retry).toBeFocused()
    await expect(page.locator('output[data-import-status]')).toHaveCount(1)
    await expect(page.locator('#mapping-readiness-message')).not.toHaveAttribute('aria-live')
  })
})
