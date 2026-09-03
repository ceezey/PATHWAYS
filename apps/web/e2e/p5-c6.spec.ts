import { type Locator, type Page, expect, test } from '@playwright/test'

const seedPrototypeSession = async (page: Page, role = 'Program Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'p5-c6@demo.pathways.local',
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
        token: 'p5-c6-beneficiary-access',
      }),
    )
  })
}

const getRect = async (locator: Locator) => {
  const rect = await locator.boundingBox()
  expect(rect).not.toBeNull()
  return rect as NonNullable<typeof rect>
}

test.describe('P5-C6 responsive baseline and remediation', () => {
  test('project header keeps readable narrative and contained metrics at audit widths', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page)
    const layoutFailures: string[] = []

    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/projects/futuremakers-ncr')
      const header = page
        .getByRole('heading', { name: 'FutureMakers NCR' })
        .locator('xpath=ancestor::section[1]')

      for (const shell of ['expanded', 'compact'] as const) {
        if (shell === 'compact') {
          await page.getByRole('button', { name: 'Collapse sidebar' }).click()
        }

        const narrative = header.locator(':scope > div').first().locator(':scope > div').first()
        const metrics = header.getByText('Project period').locator('xpath=..').locator('xpath=..')
        const narrativeRect = await getRect(narrative)
        const metricsRect = await getRect(metrics)
        const headerRect = await getRect(header)
        const documentOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )

        console.log(
          `RESP001 ${width}px ${shell}: narrative=${Math.round(narrativeRect.width)} metrics=${Math.round(metricsRect.width)} header=${Math.round(headerRect.width)} overflow=${documentOverflow}`,
        )
        if (narrativeRect.width < 280) layoutFailures.push(`${width}-${shell}-narrative`)
        if (metricsRect.x + metricsRect.width > headerRect.x + headerRect.width) {
          layoutFailures.push(`${width}-${shell}-metrics`)
        }
        if (documentOverflow !== 0) layoutFailures.push(`${width}-${shell}-overflow`)
      }
    }
    expect(layoutFailures).toHaveLength(0)
  })

  test('coverage locations have independent targets and viewport-safe tooltips at audit widths', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page)
    const mapFailures: string[] = []

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/analytics')
      const map = page.getByRole('region', { name: 'Project reach by location' })
      const graphic = map.getByRole('img', { name: 'Aggregate project coverage map' }).locator('..')
      const markers = graphic.locator('button[aria-haspopup="dialog"]')
      await expect(markers).toHaveCount(9)

      const markerRects = await markers.evaluateAll((items) =>
        items.map((item) => {
          const rect = item.getBoundingClientRect()
          return { height: rect.height, left: rect.left, top: rect.top, width: rect.width }
        }),
      )
      const overlappingPairs: string[] = []
      for (let left = 0; left < markerRects.length; left += 1) {
        for (let right = left + 1; right < markerRects.length; right += 1) {
          const a = markerRects[left]
          const b = markerRects[right]
          if (
            a.left < b.left + b.width &&
            a.left + a.width > b.left &&
            a.top < b.top + b.height &&
            a.top + a.height > b.top
          ) {
            overlappingPairs.push(`${left}-${right}`)
          }
        }
      }

      let clippedTooltips = 0
      for (let index = 0; index < (await markers.count()); index += 1) {
        const marker = markers.nth(index)
        await marker.scrollIntoViewIfNeeded()
        await marker.focus()
        const tooltipId = await marker.getAttribute('aria-describedby')
        const tooltip = page.locator(`#${tooltipId}`)
        const rect = await getRect(tooltip)
        const clipReason = await tooltip.evaluate((node) => {
          const tooltipRect = node.getBoundingClientRect()
          const outsideViewport =
            tooltipRect.left < 0 ||
            tooltipRect.right > window.innerWidth ||
            tooltipRect.top < 0 ||
            tooltipRect.bottom > window.innerHeight
          let ancestor = node.parentElement
          while (ancestor) {
            const style = getComputedStyle(ancestor)
            if (/(hidden|clip)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
              const clipRect = ancestor.getBoundingClientRect()
              if (
                tooltipRect.left < clipRect.left ||
                tooltipRect.right > clipRect.right ||
                tooltipRect.top < clipRect.top ||
                tooltipRect.bottom > clipRect.bottom
              ) {
                return `${ancestor.tagName}.${ancestor.className}: ${JSON.stringify({
                  clip: {
                    bottom: clipRect.bottom,
                    left: clipRect.left,
                    right: clipRect.right,
                    top: clipRect.top,
                  },
                  tooltip: {
                    bottom: tooltipRect.bottom,
                    left: tooltipRect.left,
                    right: tooltipRect.right,
                    top: tooltipRect.top,
                  },
                })}`
              }
            }
            ancestor = ancestor.parentElement
          }
          return outsideViewport ? `viewport: ${JSON.stringify(tooltipRect.toJSON())}` : null
        })
        if (clipReason) {
          clippedTooltips += 1
          console.log(
            `RESP003 ${width}px ${await marker.getAttribute('aria-label')}: ${clipReason}`,
          )
        }
        expect(rect.width).toBeGreaterThan(0)

        if (index % 2 === 0) {
          await marker.press('Enter')
        } else {
          await marker.click()
        }
        const dialog = page.getByRole('dialog', { name: /location details/ })
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Close' }).click()
      }

      const smallestTarget = Math.min(
        ...markerRects.map(({ height, width: targetWidth }) => Math.min(height, targetWidth)),
      )
      console.log(
        `RESP003 ${width}px: targets=${smallestTarget.toFixed(1)}px overlaps=${overlappingPairs.length} clippedTooltips=${clippedTooltips}`,
      )
      if (smallestTarget < 44) mapFailures.push(`${width}-target`)
      if (overlappingPairs.length > 0) mapFailures.push(`${width}-overlap`)
      if (clippedTooltips > 0) mapFailures.push(`${width}-tooltip`)
    }
    expect(mapFailures).toHaveLength(0)
  })

  test('desktop sidebar remains viewport-bound and all controls are reachable on a long workspace', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedPrototypeSession(page)
    await page.setViewportSize({ width: 1024, height: 640 })
    await page.goto('/analytics')
    await expect(page.getByRole('heading', { name: 'Project performance trend' })).toBeVisible()

    const sidebar = page.getByRole('complementary')
    const roleControl = sidebar.getByRole('combobox', { name: 'Prototype Role Preview' })
    const dimensions = await page.evaluate(() => ({
      mainScrollHeight: document.querySelector('main')?.scrollHeight ?? 0,
      pageHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    }))
    await page.evaluate(() =>
      window.scrollTo(
        0,
        Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      ),
    )
    const sidebarRect = await getRect(sidebar)
    const roleRect = await getRect(roleControl)
    const overflowY = await sidebar.evaluate((node) => getComputedStyle(node).overflowY)
    const scrollContainers = await sidebar.evaluate((node) => {
      const descendants = Array.from(node.querySelectorAll<HTMLElement>('*'))
      return [node as HTMLElement, ...descendants].filter((item) => {
        const overflow = getComputedStyle(item).overflowY
        return /(auto|scroll)/.test(overflow) && item.scrollHeight > item.clientHeight
      }).length
    })

    console.log(
      `RESP004 pageHeight=${dimensions.pageHeight} mainHeight=${dimensions.mainScrollHeight} sidebarTop=${Math.round(sidebarRect.y)} sidebarBottom=${Math.round(sidebarRect.y + sidebarRect.height)} roleTop=${Math.round(roleRect.y)} overflowY=${overflowY} scrollContainers=${scrollContainers}`,
    )
    expect(dimensions.mainScrollHeight).toBeGreaterThan(640)
    expect(sidebarRect.y).toBeGreaterThanOrEqual(0)
    expect(sidebarRect.y + sidebarRect.height).toBeLessThanOrEqual(640)
    expect(overflowY).toMatch(/auto|scroll/)
    expect(scrollContainers).toBe(1)

    await sidebar.evaluate((node) => node.scrollTo(0, node.scrollHeight))
    await expect(roleControl).toBeVisible()
    const finalRoleRect = await getRect(roleControl)
    expect(finalRoleRect.y).toBeGreaterThanOrEqual(0)
    expect(finalRoleRect.y + finalRoleRect.height).toBeLessThanOrEqual(640)
  })

  test('representative static and dynamic routes expose privacy-safe purpose-first titles', async ({
    page,
  }) => {
    const publicRoutes = [
      ['/', 'Public Impact Overview'],
      ['/public/projects', 'Public Project Directory'],
      ['/public/projects/futuremakers-ncr', 'Public Project Story'],
      ['/staff/login', 'Staff Sign In'],
    ] as const
    const titles = new Set<string>()

    for (const [route, purpose] of publicRoutes) {
      await page.goto(route)
      await expect(page).toHaveTitle(`${purpose} | PATHWAYS`)
      titles.add(await page.title())
    }

    await seedPrototypeSession(page)
    for (const [route, purpose] of [
      ['/dashboard', 'Staff Dashboard'],
      ['/projects', 'Project Directory'],
      ['/projects/futuremakers-ncr', 'Project Workspace'],
      ['/analytics', 'Analytics Workspace'],
    ] as const) {
      await page.goto(route)
      await expect(page).toHaveTitle(`${purpose} | PATHWAYS`)
      titles.add(await page.title())
    }

    expect(titles.size).toBe(8)
    for (const title of titles) {
      expect(title).not.toMatch(/FutureMakers|BEN-|@|p5-c6/i)
    }
  })

  test('reduced motion removes nonessential movement while text status remains', async ({
    page,
  }) => {
    await seedPrototypeSession(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/analytics')

    await expect(page.getByRole('heading', { name: 'Project reach by location' })).toBeVisible()
    await expect(page.getByText('Prototype map')).toBeVisible()
    expect(
      await page.locator('html').evaluate((node) => getComputedStyle(node).scrollBehavior),
    ).toBe('auto')

    const motionProbe = page.locator('body').evaluate(() => {
      const node = document.createElement('div')
      node.className = 'animate-pulse transition-all'
      node.textContent = 'Loading remains described in text.'
      node.dataset.motionProbe = 'true'
      document.body.append(node)
    })
    await motionProbe
    const probe = page.locator('[data-motion-probe="true"]')
    expect(await probe.evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
    expect(
      await probe.evaluate((node) => Number.parseFloat(getComputedStyle(node).transitionDuration)),
    ).toBeLessThanOrEqual(0.001)
    await expect(probe).toHaveText('Loading remains described in text.')

    const marker = page
      .getByRole('region', { name: 'Project reach by location' })
      .locator('button[aria-haspopup="dialog"]')
      .first()
    const transformBefore = await marker.evaluate((node) => getComputedStyle(node).transform)
    await marker.hover()
    expect(await marker.evaluate((node) => getComputedStyle(node).transform)).toBe(transformBefore)
  })

  test('staff siblings use the governed PageHeader framing contract', async ({ page }) => {
    await seedBeneficiaryAccess(page)

    const expectGovernedFrame = async (title: string, action: string) => {
      const heading = page.getByRole('heading', { level: 1, name: title })
      const frame = heading.locator('xpath=ancestor::header[1]')
      await expect(frame).toBeVisible()
      await expect(frame).toHaveClass(/border-b/)
      await expect(frame).not.toHaveClass(/bg-card|shadow-sm|rounded-lg/)
      await expect(frame.getByRole('link', { name: action })).toBeVisible()
    }

    await page.goto('/beneficiaries')
    await expectGovernedFrame('Beneficiary Journey Tracking', 'Add beneficiary')
    await page.getByRole('combobox', { name: 'Prototype Role Preview' }).click()
    await page.getByRole('option', { name: 'Program Manager', exact: true }).click()

    for (const [route, title, action] of [
      ['/analytics', 'Data Analysis', 'View alert rules'],
      ['/alerts', 'Rule-Based Alerts', 'Human-reviewed recommendation'],
      ['/reports', 'Reports', 'Open report preview'],
    ] as const) {
      await page.goto(route)
      await expectGovernedFrame(title, action)
    }
  })
})
