import { type Locator, type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page, role = 'Project Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'p5-c2@demo.pathways.local',
        displayName: `${selectedRole} Demo`,
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

const verifyRouteStructureAndSkipLink = async (page: Page, path: string) => {
  await page.goto(path)
  await expect(page.locator('main')).toHaveCount(1)
  await expect(page.locator('main main')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

  const levels = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))))
  expect(levels[0]).toBe(1)
  levels.slice(1).forEach((level, index) => {
    expect(level - levels[index]).toBeLessThanOrEqual(1)
  })

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeVisible()
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
}

const expectAssociatedError = async (control: Locator, message: string) => {
  await expect(control).toHaveAttribute('aria-invalid', 'true')
  const descriptionIds = (await control.getAttribute('aria-describedby'))?.split(/\s+/) ?? []
  expect(descriptionIds.length).toBeGreaterThan(0)
  const describedText = await control
    .page()
    .locator(descriptionIds.map((id) => `#${id}`).join(','))
    .allTextContents()
  expect(describedText.join(' ')).toContain(message)
}

test.describe('P5-C2 controlled remediation', () => {
  test('dashboard, public, and auth routes have one main, one h1, and first-tab skip navigation', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page, 'Project Manager')
    await verifyRouteStructureAndSkipLink(page, '/dashboard')
    await verifyRouteStructureAndSkipLink(page, '/')
    await verifyRouteStructureAndSkipLink(page, '/staff/login')
  })

  test('login and project forms expose required state and associated errors on Enter submission', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto('/staff/login')
    const identifier = page.getByLabel(/Username or email.*required/i)
    const password = page.getByLabel(/Password.*required/i, { exact: true })
    await identifier.fill('')
    await password.fill('')
    await password.press('Enter')
    await expectAssociatedError(identifier, 'Enter your username or email.')
    await expectAssociatedError(password, 'Password must be at least 8 characters.')

    await seedPrototypeSession(page, 'Project Manager')
    await page.evaluate(() => {
      window.localStorage.setItem(
        'pathways.prototypeSession',
        JSON.stringify({
          email: 'project.manager@demo.pathways.local',
          displayName: 'Project Manager Demo',
          role: 'Project Manager',
          signedInAt: new Date().toISOString(),
        }),
      )
      window.localStorage.setItem('pathways.prototypeRole', 'Project Manager')
    })
    await page.goto('/projects/new')
    const title = page.getByLabel(/Project title.*required/i)
    await title.fill('')
    await title.press('Enter')
    await expectAssociatedError(title, 'Enter a project title.')
  })

  test('rule and recommendation validation is inline and toast feedback remains supplemental', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page, 'System Administrator')
    await page.goto('/alerts/repository')
    await page.getByRole('tab', { name: 'Create rule' }).click()
    await page.getByRole('button', { name: 'New rule' }).click()
    const ruleName = page.getByLabel(/Rule name.*required/i)
    const parameter = page.getByLabel(/Parameter.*required/i)
    const suggestedAction = page.getByLabel(/Suggested action.*required/i)
    await parameter.fill('')
    await suggestedAction.fill('')
    await ruleName.press('Enter')
    await expectAssociatedError(ruleName, 'Enter a rule name.')
    await expectAssociatedError(parameter, 'Enter a rule parameter.')
    await expectAssociatedError(suggestedAction, 'Enter a suggested action.')
    await expect(page.getByText('Check the required rule fields.')).toBeVisible()

    await page.goto('/recommendations')
    await page.getByRole('button', { name: 'Log outcome' }).click()
    const outcomeNote = page.getByLabel(/Outcome note.*required/i)
    await outcomeNote.fill('')
    await outcomeNote.press('Enter')
    await expectAssociatedError(outcomeNote, 'Add an outcome note before saving.')
    await expect(page.getByText('Check the outcome form.')).toBeVisible()
  })

  for (const viewport of [
    { name: 'short portrait', width: 390, height: 520 },
    { name: 'short landscape / 200% reflow proxy', width: 640, height: 360 },
  ]) {
    test(`long dialog remains bounded and keyboard-traversable at ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      await seedPrototypeSession(page)
      await page.goto('/projects/futuremakers-ncr/activities')
      await page.getByRole('button', { name: 'New Activity' }).click()

      const dialog = page.getByRole('dialog', { name: 'Create activity' })
      await expect(dialog).toBeVisible()
      const measurements = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const nestedScrollContainers = Array.from(
          element.querySelectorAll<HTMLElement>('*'),
        ).filter((child) => {
          const overflowY = getComputedStyle(child).overflowY
          return (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            child.scrollHeight > child.clientHeight
          )
        })
        return {
          bottom: rect.bottom,
          clientHeight: element.clientHeight,
          nestedScrollContainers: nestedScrollContainers.length,
          overflowY: getComputedStyle(element).overflowY,
          scrollHeight: element.scrollHeight,
          top: rect.top,
        }
      })
      expect(measurements.top).toBeGreaterThanOrEqual(15)
      expect(measurements.bottom).toBeLessThanOrEqual(viewport.height - 15)
      expect(measurements.overflowY).toBe('auto')
      expect(measurements.scrollHeight).toBeGreaterThan(measurements.clientHeight)
      expect(measurements.nestedScrollContainers).toBe(0)

      const description = page.getByLabel(/Description.*required/i)
      await description.focus()
      await expect(description).toBeFocused()
      expect(await description.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
        'none',
      )

      const expectedControls = new Set(['Cancel', 'Create Activity', 'Close'])
      const reachedControls = new Set<string>()
      for (let index = 0; index < 30 && reachedControls.size < expectedControls.size; index += 1) {
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null
          if (!element) return { bottom: -1, name: '', top: -1 }
          const rect = element.getBoundingClientRect()
          return {
            bottom: rect.bottom,
            name: (element.getAttribute('aria-label') || element.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            top: rect.top,
          }
        })
        if (expectedControls.has(focused.name)) {
          reachedControls.add(focused.name)
          expect(focused.top).toBeGreaterThanOrEqual(0)
          expect(focused.bottom).toBeLessThanOrEqual(viewport.height)
        }
        await page.keyboard.press('Tab')
      }
      expect([...reachedControls].sort()).toEqual([...expectedControls].sort())
    })
  }
})
