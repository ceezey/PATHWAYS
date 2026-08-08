import { type Page, expect, test } from '@playwright/test'

const prototypePassword = 'PathwaysDemo!2026'

const seedPrototypeSession = async (page: Page, role = 'Program Manager') => {
  await page.addInitScript((selectedRole) => {
    window.localStorage.setItem(
      'pathways.prototypeSession',
      JSON.stringify({
        email: 'program.manager@demo.pathways.local',
        displayName: 'Program Manager Demo',
        role: selectedRole,
        signedInAt: new Date().toISOString(),
      }),
    )
    window.localStorage.setItem('pathways.prototypeRole', selectedRole)
  }, role)
}

const seedBeneficiaryAccess = async (page: Page, role = 'Monitoring and Evaluation Officer') => {
  await seedPrototypeSession(page, role)
  await page.addInitScript((selectedRole) => {
    const now = new Date()
    window.sessionStorage.setItem(
      'pathways.beneficiaryAccess',
      JSON.stringify({
        role: selectedRole,
        verifiedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        token: 'playwright-beneficiary-access',
      }),
    )
  }, role)
}

const sidebarDestinationsByRole = {
  'Program Manager': [
    '/dashboard',
    '/projects',
    '/beneficiaries',
    '/analytics',
    '/alerts',
    '/recommendations',
    '/reports',
    '/alerts/repository',
  ],
  'Project Manager': [
    '/dashboard',
    '/projects',
    '/beneficiaries',
    '/analytics',
    '/alerts',
    '/recommendations',
    '/reports',
    '/alerts/repository',
  ],
  'Monitoring and Evaluation Officer': [
    '/dashboard',
    '/projects',
    '/beneficiaries',
    '/analytics',
    '/reports',
    '/alerts/repository',
  ],
  'Project Officer': ['/dashboard', '/projects', '/beneficiaries', '/analytics', '/reports'],
  'System Administrator': [
    '/dashboard',
    '/projects',
    '/beneficiaries',
    '/analytics',
    '/alerts',
    '/recommendations',
    '/reports',
    '/alerts/repository',
    '/settings/users',
    '/settings/labels',
  ],
} as const

test('public dashboard links work without the internal sidebar', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'PATHWAYS Public Project Dashboard' }),
  ).toBeVisible()
  await expect(page.getByText('Prototype Role Preview')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Staff Login|Sign In|Admin Login/i })).toHaveCount(0)

  await page.locator('a[href="/public/projects"]').first().click()
  await expect(page).toHaveURL(/\/public\/projects$/)
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()

  await Promise.all([
    page.waitForURL(/\/public\/projects\/futuremakers-ncr$/, { timeout: 15_000 }),
    page
      .getByRole('link', { name: /View project story/i })
      .first()
      .click(),
  ])
  await expect(page.getByRole('heading', { name: 'FutureMakers NCR' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'About the Project' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Donate Now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit staff preview' })).toHaveCount(0)
  await expect(page.getByText('View Youth RISE')).toHaveCount(0)
  await expect(page.getByText('Aggregate, non-sensitive project information only.')).toBeVisible()
  await expect(
    page.getByRole('img', {
      name: 'A fictional group of adult learners taking part in a facilitated skills workshop.',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Donate Now' }).click()
  const donationNotice = page.getByRole('dialog', { name: 'Donate to FutureMakers NCR' })
  await expect(donationNotice.getByText('Prototype-only action')).toBeVisible()
  await donationNotice.getByRole('button', { name: 'Close' }).first().click()
})

test('Program Manager customizes a browser-local staff preview without changing the public page', async ({
  page,
}) => {
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/projects/futuremakers-ncr/transparency')
  const previewLink = page.getByRole('link', { name: 'Open staff preview' })
  await expect(previewLink).toHaveAttribute(
    'href',
    '/projects/futuremakers-ncr/transparency/preview',
  )
  await Promise.all([
    page.waitForURL(/\/projects\/futuremakers-ncr\/transparency\/preview$/, { timeout: 30_000 }),
    previewLink.click(),
  ])

  const sections = page.locator('[data-public-section]')
  await expect(page.getByText('Staff-only prototype preview.')).toBeVisible()
  await expect(page.locator('[data-public-mode="staff-preview"]')).toHaveAttribute(
    'data-public-layout',
    'story-led',
  )
  await expect(sections).toHaveCount(5)
  await expect(sections.first()).toHaveAttribute('data-public-section', 'overview')

  await page.getByRole('button', { name: 'Edit staff preview' }).click()
  const editor = page.getByRole('dialog', { name: 'Edit staff public-dashboard preview' })
  await expect(
    editor.getByText('Changes stay in this staff browser and are not published.'),
  ).toBeVisible()

  await editor.getByLabel('Public headline').fill('A public story shaped for stakeholder review')
  await editor
    .getByLabel('Public summary')
    .fill('Approved aggregate progress is presented here in concise, public-facing language.')
  await editor
    .getByLabel('Project quote')
    .fill('The project is turning local momentum into action.')
  await editor.getByLabel('Button label').fill('Explore more projects')
  await editor.getByLabel('Destination').click()
  await page.getByRole('option', { name: 'Public dashboard home' }).click()
  await editor.getByLabel('Layout preset').click()
  await page.getByRole('option', { name: /Compact/ }).click()
  await editor.getByRole('button', { name: 'Move Approved project media up' }).click()
  await editor.getByRole('button', { name: 'Hide Milestones and accomplishments' }).click()
  await editor.getByRole('button', { name: 'Save prototype view' }).click()

  await expect(page.getByText('A public story shaped for stakeholder review')).toBeVisible()
  await expect(page.getByText('The project is turning local momentum into action.')).toBeVisible()
  await expect(page.locator('[data-public-mode="staff-preview"]')).toHaveAttribute(
    'data-public-layout',
    'compact',
  )
  await expect(page.getByRole('link', { name: 'Explore more projects' })).toHaveAttribute(
    'href',
    '/',
  )
  await expect(sections).toHaveCount(4)
  await expect(sections.first()).toHaveAttribute('data-public-section', 'media')
  await expect(page.locator('[data-public-section="milestones"]')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('A public story shaped for stakeholder review')).toBeVisible()
  await expect(sections.first()).toHaveAttribute('data-public-section', 'media')

  await page.goto('/public/projects/futuremakers-ncr')
  await expect(page.getByText('A public story shaped for stakeholder review')).toHaveCount(0)
  await expect(page.locator('[data-public-mode="public"]')).toHaveAttribute(
    'data-public-layout',
    'story-led',
  )
  await expect(page.getByRole('button', { name: 'Edit staff preview' })).toHaveCount(0)

  await page.goto('/projects/youth-rise-western-samar/transparency/preview')
  await expect(page.getByText('A public story shaped for stakeholder review')).toHaveCount(0)
  await expect(page.locator('[data-public-mode="staff-preview"]')).toHaveAttribute(
    'data-public-layout',
    'compact',
  )
  await expect(page.locator('[data-public-section]').first()).toHaveAttribute(
    'data-public-section',
    'overview',
  )
  await expect(page.locator('[data-public-section]').nth(1)).toHaveAttribute(
    'data-public-section',
    'media',
  )
})

test('public-dashboard staff preview rejects a non-designated internal role', async ({ page }) => {
  await seedPrototypeSession(page, 'Project Officer')
  await page.goto('/projects/futuremakers-ncr/transparency/preview')

  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()
  await expect(page.getByText('Staff-only prototype preview.')).toHaveCount(0)
})

test('public project presentation remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/public/projects/futuremakers-ncr')

  await expect(page.getByRole('heading', { name: 'FutureMakers NCR' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit staff preview' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Donate Now' })).toBeVisible()
  await expect(page.locator('[data-public-section]')).toHaveCount(5)

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('public project recovery and presentation links remain navigable', async ({ page }) => {
  await page.goto('/public/projects/not-an-approved-project')
  await expect(page.getByRole('heading', { name: 'Project page not found' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.getByRole('link', { name: 'Browse public projects' }).click()
  await expect(page).toHaveURL(/\/public\/projects$/)

  await page.goto('/public/projects/futuremakers-ncr')
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(breadcrumb.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  await expect(breadcrumb.getByRole('link', { name: 'Public projects' })).toHaveAttribute(
    'href',
    '/public/projects',
  )
  await expect(page.locator('a[href="/public/projects"]')).not.toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Donate Now' })).toBeVisible()
})

test('login works and role preview switches through every supported role', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/staff\/login$/)

  await expect(page.getByRole('heading', { name: 'Sign in to PATHWAYS' })).toBeVisible()
  await page.getByRole('button', { name: 'Demo Accounts' }).click()
  await page
    .getByRole('dialog', { name: 'Demo accounts' })
    .getByRole('button', { name: /Program Manager/ })
    .click()
  await page.keyboard.press('Escape')
  await page.getByLabel('Password', { exact: true }).fill(prototypePassword)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page.getByRole('heading', { name: 'OTP verification' })).toBeVisible()
  await page.getByLabel('Six-digit OTP code').fill('123456')
  await page.getByRole('button', { name: 'Verify Code' }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })

  const roleSwitcher = page.getByRole('combobox', { name: 'Prototype Role Preview' })
  await expect(roleSwitcher).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()
  await expect(page.getByText('Grant Manager')).toHaveCount(0)

  for (const role of [
    'Project Manager',
    'Monitoring and Evaluation Officer',
    'Project Officer',
    'System Administrator',
  ]) {
    await roleSwitcher.click()
    await page.getByRole('option', { name: role }).click()
    await expect(page.getByRole('heading', { name: `${role} dashboard` })).toBeVisible()
  }
})

test('dashboard navigation and legacy route redirects are reachable', async ({ page }) => {
  await seedPrototypeSession(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()

  for (const linkName of [
    'Projects',
    'Beneficiaries',
    'Analytics',
    'Alerts',
    'Recommendations',
    'Reports',
    'Alerts Repository',
  ]) {
    await expect(page.getByRole('link', { name: linkName }).first()).toBeVisible()
  }

  await page.goto('/participants')
  await expect(page).toHaveURL(/\/beneficiaries$/)
  await expect(
    page.getByRole('heading', { name: 'Verify beneficiary module access' }),
  ).toBeVisible()

  await page.goto('/imports')
  await expect(page).toHaveURL(/\/collection\/import$/)
  await expect(page.getByText('Unauthorized access')).toBeVisible()
  await expect(page.getByText(/cannot access Collection/)).toBeVisible()
})

for (const [role, destinations] of Object.entries(sidebarDestinationsByRole)) {
  test(`${role} sidebar destinations open without a dead end`, async ({ page }) => {
    test.setTimeout(120_000)
    await seedBeneficiaryAccess(page, role)
    await page.goto('/dashboard')

    const navigation = page.locator('nav[aria-label="Dashboard"]').first()
    const links = navigation.locator('a')
    await expect(links).toHaveCount(destinations.length)
    expect(
      await links.evaluateAll((items) => items.map((item) => item.getAttribute('href'))),
    ).toEqual([...destinations])

    for (const href of destinations) {
      await page.goto('/dashboard')
      await navigation.locator(`a[href="${href}"]`).click()
      await page.waitForURL((url) => url.pathname === href)

      await expect(page.getByRole('heading', { name: 'Unauthorized access' })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Route not found' })).toHaveCount(0)
      await expect(navigation.locator(`a[href="${href}"]`)).toHaveAttribute('aria-current', 'page')
    }
  })
}

test('mobile sidebar navigation closes after opening a workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedPrototypeSession(page, 'Project Officer')
  await page.goto('/dashboard')

  await page.getByRole('button', { name: 'Open navigation' }).click()
  const navigation = page.getByRole('dialog', { name: 'Workspace navigation' })
  await navigation.getByRole('link', { name: 'Projects', exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(navigation).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Project Information Management' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('Program Manager executive summary prioritizes delivery and goal outlook', async ({
  page,
}) => {
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()
  await expect(page.getByText('Grant Manager')).toHaveCount(0)

  const executiveSummary = page.getByRole('region', { name: 'Active project portfolio' })
  await expect(executiveSummary).toBeVisible()
  await expect(executiveSummary.getByText('Delivery outlook')).toBeVisible()
  await expect(executiveSummary.getByText('Goal outlook', { exact: true }).first()).toBeVisible()
  await expect(
    executiveSummary.getByText('Achievable with intervention', { exact: true }),
  ).toBeVisible()
  await expect(
    executiveSummary.getByRole('link', { name: 'Review Project Portfolio' }),
  ).toHaveAttribute('href', '/projects')
  await expect(page.getByText('Portfolio impact')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit presentation content' })).toHaveCount(0)

  const projectContext = executiveSummary.getByRole('combobox', { name: 'Project context' })
  await projectContext.click()
  await page.getByRole('option', { name: 'Safe Spaces · Northern Samar' }).click()
  await expect(page.getByRole('heading', { name: 'Safe Spaces · Northern Samar' })).toBeVisible()
  await expect(page.getByText('Behind Schedule', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Needs recovery plan', { exact: true })).toBeVisible()
})

test('project directory, workspace tabs, and activity dialog are navigable', async ({ page }) => {
  test.setTimeout(120_000)
  await seedPrototypeSession(page, 'Project Manager')
  await page.goto('/projects')

  await expect(page.getByRole('heading', { name: 'Project Information Management' })).toBeVisible()
  await expect(page.getByLabel('Search projects')).toBeVisible()

  await page.goto('/projects/futuremakers-ncr/activities')
  await expect(page.getByRole('heading', { name: 'Project Activities' })).toBeVisible()

  const statusSummary = page.getByRole('region', { name: 'Activity status summary' })
  await expect(statusSummary.getByText('Showing 2 of 2 activities')).toBeVisible()

  const board = page.getByRole('region', { name: 'Activity board' })
  const boardCard = board.getByRole('article', {
    name: 'Activity: Deliver skills bootcamp sessions',
  })
  await expect(boardCard.getByText('In Progress', { exact: true })).toBeVisible()
  await expect(boardCard.getByText('Due Aug 30, 2026')).toBeVisible()
  await expect(boardCard.getByText('Owners', { exact: true })).toBeVisible()
  await expect(boardCard.getByText('Record the next progress update')).toBeVisible()
  await expect(boardCard.getByRole('button', { name: 'View details' })).toBeVisible()

  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('heading', { name: 'Activity list' })).toBeVisible()

  const listCard = page.getByRole('article', {
    name: 'Activity: Deliver skills bootcamp sessions',
  })
  await expect(listCard.getByText('In Progress', { exact: true })).toBeVisible()
  await expect(listCard.getByText('Due Aug 30, 2026')).toBeVisible()
  await expect(listCard.getByText('Project Officer A, Project Officer B')).toBeVisible()
  await Promise.all([
    page.waitForURL(/\/projects\/futuremakers-ncr\/activities\/act-fm-02$/, {
      timeout: 30_000,
    }),
    listCard.getByRole('button', { name: 'View details' }).click(),
  ])
  await expect(
    page.getByRole('heading', { name: 'Deliver skills bootcamp sessions' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview Completion' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview Return' })).toBeVisible()
  await page.getByRole('button', { name: 'Preview Completion' }).click()
  await expect(page.getByText('Completion action previewed.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/projects\/futuremakers-ncr\/activities$/)

  for (const tab of [
    'Monitoring & Evaluation',
    'Budget',
    'Journey Stages',
    'Public Project Dashboard',
  ]) {
    await expect(page.getByRole('link', { name: tab })).toBeVisible()
  }

  await page.getByRole('button', { name: 'New Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Create activity' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
})

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`activity workspace stays clear at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await seedPrototypeSession(page, 'Project Manager')
    await page.goto('/projects/futuremakers-ncr/activities')

    await expect(page.getByRole('region', { name: 'Activity status summary' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Activity board' })).toBeVisible()
    await expect(
      page.getByRole('article', {
        name: 'Activity: Run cohort orientation and baseline profiling',
      }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'List view' }).click()
    await expect(page.getByRole('heading', { name: 'Activity list' })).toBeVisible()
    await expect(
      page.getByRole('article', { name: 'Activity: Deliver skills bootcamp sessions' }),
    ).toBeVisible()
  })
}

test('beneficiary directory and analytics screens expose critical controls', async ({ page }) => {
  await seedPrototypeSession(page, 'Monitoring and Evaluation Officer')
  await page.goto('/beneficiaries')

  await expect(
    page.getByRole('heading', { name: 'Verify beneficiary module access' }),
  ).toBeVisible()
  await expect(page.getByText('Client demonstration PIN: 2468')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beneficiary management' })).toHaveCount(0)
  await page.getByLabel('Beneficiary access PIN').fill('0000')
  const beneficiaryVerifyButton = page.getByRole('button', { name: 'Verify and enter' })
  await expect(beneficiaryVerifyButton).toBeEnabled()
  await beneficiaryVerifyButton.click()
  await expect(page.getByText('Invalid beneficiary access PIN.')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Beneficiary access PIN').fill('2468')
  await expect(beneficiaryVerifyButton).toBeEnabled()
  await beneficiaryVerifyButton.click()
  await expect(page.getByRole('heading', { name: 'Beneficiary Journey Tracking' })).toBeVisible()
  const beneficiarySearch = page.getByRole('searchbox', { name: 'Search by name or code' })
  await expect(beneficiarySearch).toBeVisible()

  await beneficiarySearch.fill('Beneficiary WS 014')
  await expect(page.getByRole('link', { name: 'Beneficiary WS-014' })).toBeVisible()
  await expect(page.getByText('BEN-WS-014 · Calbayog')).toBeVisible()

  await beneficiarySearch.fill('BEN-NAV-022')
  await expect(page.getByRole('link', { name: 'Beneficiary NAV-022' })).toBeVisible()
  await expect(page.getByText('BEN-NAV-022 · Navotas')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Edit page heading' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Beneficiary Journey Tracking' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Beneficiaries', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify access' })).toHaveCount(0)

  await page.goto('/analytics')
  await expect(page.getByRole('heading', { level: 1, name: 'Data Analysis' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View alert rules' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rule-Based Alerts', exact: true })).toHaveCount(0)

  await page.goto('/collection/import')
  await expect(page.getByText('File reading progress')).toBeVisible()
})

test('view-only Alerts Repository hides configuration actions', async ({ page }) => {
  await seedPrototypeSession(page, 'Monitoring and Evaluation Officer')
  await page.goto('/alerts/repository')

  await expect(page.getByRole('heading', { name: 'Alerts Repository' })).toBeVisible()
  await expect(page.getByText('View-only access')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Create rule' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create rule' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Alerts Repository' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('legacy administration routes forward to the refined workspaces', async ({ page }) => {
  await seedPrototypeSession(page, 'System Administrator')

  await page.goto('/settings')
  await expect(page).toHaveURL(/\/settings\/users$/)
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()

  await page.goto('/settings/rules')
  await expect(page).toHaveURL(/\/alerts\/repository$/)
  await expect(page.getByRole('heading', { name: 'Alerts Repository' })).toBeVisible()
})

test('alert recommendation links preserve the selected review context', async ({ page }) => {
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/alerts')

  const recommendationLink = page.getByRole('link', { name: 'View recommended action' })
  const destination = await recommendationLink.getAttribute('href')
  expect(destination).toMatch(/^\/recommendations\?recommendation=/)
  await recommendationLink.click()
  await expect(page).toHaveURL(/\/recommendations\?recommendation=/)
  await expect(page.getByRole('heading', { name: 'Human-reviewed recommendation' })).toBeVisible()
})

test('Beneficiary record supports mock review and local photo and video previews', async ({
  page,
}) => {
  await seedBeneficiaryAccess(page)
  await page.goto('/beneficiaries/ben-001')

  const media = page.getByRole('region', { name: 'Media proof' })
  await expect(media).toBeVisible()
  await expect(media.getByText('Frontend prototype')).toBeVisible()
  await expect(media.getByText(/not uploaded, synced, or published/i)).toBeVisible()
  await expect(media.getByRole('article', { name: /Media proof:/ })).toHaveCount(3)
  await expect(media.getByText('Photo preview placeholder').first()).toBeVisible()
  await expect(media.getByText('Video preview placeholder')).toBeVisible()

  const videoCard = media.getByRole('article', {
    name: 'Media proof: bootcamp-demonstration.mp4',
  })
  await videoCard.getByRole('button', { name: 'Review bootcamp-demonstration.mp4' }).click()
  const review = page.getByRole('dialog', { name: 'Review media proof' })
  await review.getByLabel('Review status').click()
  await page.getByRole('option', { name: 'Accepted' }).click()
  await review.getByLabel('Review note (optional)').fill('Accepted during frontend client review.')
  await review.getByRole('button', { name: 'Save local review' }).click()
  await expect(videoCard.getByText('Accepted')).toBeVisible()

  await media.getByRole('button', { name: 'Videos' }).click()
  await expect(media.getByRole('article', { name: /Media proof:/ })).toHaveCount(1)
  await media.getByRole('button', { name: 'Add local media' }).first().click()

  const addDialog = page.getByRole('dialog', { name: 'Add local media preview' })
  await addDialog.getByLabel('Photo or video files').setInputFiles([
    {
      name: 'local-session-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    },
    {
      name: 'local-session-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('PATHWAYS local prototype video'),
    },
  ])
  await addDialog
    .getByLabel('Evidence note (optional)')
    .fill('Local session media selected for prototype review.')
  await addDialog.getByLabel('Tags (optional)').fill('Client review, Local proof')
  await addDialog.getByRole('button', { name: 'Add to prototype record' }).click()

  await expect(media.getByRole('article', { name: /Media proof:/ })).toHaveCount(5)
  await expect(
    media.getByRole('img', { name: 'Local proof preview: local-session-photo.png' }),
  ).toBeVisible()
  await expect(media.getByLabel('Local video proof preview: local-session-video.mp4')).toBeVisible()
  await expect(
    media
      .getByRole('article', { name: 'Media proof: local-session-photo.png' })
      .getByText('For Review'),
  ).toBeVisible()

  await page.reload()
  await expect(media.getByRole('article', { name: /Media proof:/ })).toHaveCount(3)
})

test('Beneficiary media proof remains manageable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedBeneficiaryAccess(page)
  await page.goto('/beneficiaries/ben-001')

  const media = page.getByRole('region', { name: 'Media proof' })
  await expect(media).toBeVisible()
  await expect(media.getByRole('article', { name: /Media proof:/ })).toHaveCount(3)
  await media.getByRole('button', { name: 'Add local media' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Add local media preview' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to prototype record' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('analytics location coverage answers where projects are reaching people', async ({ page }) => {
  await seedPrototypeSession(page, 'Monitoring and Evaluation Officer')
  await page.goto('/analytics')

  const coverage = page.getByRole('region', { name: 'Project reach by location' })
  await expect(coverage).toBeVisible({ timeout: 30_000 })
  await expect(coverage.getByText('Prototype map')).toBeVisible()
  await expect(coverage.getByRole('img', { name: 'Aggregate project coverage map' })).toBeVisible()
  await expect(coverage.getByText('Selected location', { exact: true })).toHaveCount(0)
  await expect(coverage.getByRole('heading', { name: 'Location summary' })).toHaveCount(0)
  await expect(coverage.getByRole('button', { name: /Beneficiaries reached/ })).toHaveCount(9)

  const navotasPoint = coverage.getByRole('button', { name: /Navotas/ })
  await navotasPoint.hover()
  const overview = coverage.getByRole('tooltip')
  await expect(overview.getByText('Navotas', { exact: true })).toBeVisible()
  await expect(overview.getByText(/698 Beneficiaries/)).toBeVisible()
  await expect(overview.getByText(/Growing coverage/)).toBeVisible()
  await page.mouse.move(0, 0)
  await navotasPoint.focus()
  await expect(overview).toBeVisible()

  await navotasPoint.click()
  const details = page.getByRole('dialog', { name: 'Navotas location details' })
  await expect(details).toBeVisible()
  await expect(details.getByText('698', { exact: true })).toBeVisible()
  await expect(details.getByText('7', { exact: true })).toBeVisible()
  await expect(details.getByText('FutureMakers NCR')).toBeVisible()
  await expect(details.getByText('Grassroots Centers - Navotas')).toBeVisible()
  await expect(details.getByText(/Approximate city-level location/)).toBeVisible()
  await details.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('combobox', { name: 'Project filter' }).click()
  await page.getByRole('option', { name: 'FutureMakers NCR' }).click()
  await expect(coverage.getByRole('button', { name: /Beneficiaries reached/ })).toHaveCount(3)
})

test('analytics map and point details remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedPrototypeSession(page, 'Monitoring and Evaluation Officer')
  await page.goto('/analytics')

  const coverage = page.getByRole('region', { name: 'Project reach by location' })
  await expect(coverage.getByRole('img', { name: 'Aggregate project coverage map' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(coverage.getByRole('button', { name: 'Show coverage map' })).toHaveCount(0)
  await expect(coverage.getByRole('heading', { name: 'Location summary' })).toHaveCount(0)

  const quezonCityPoint = coverage.getByRole('button', {
    name: /Quezon City: .*Beneficiaries reached/,
  })
  await expect(quezonCityPoint).toBeVisible()
  await quezonCityPoint.click()

  const details = page.getByRole('dialog', { name: 'Quezon City location details' })
  await expect(details).toBeVisible()
  await expect(details.getByText('386', { exact: true })).toBeVisible()
  await expect(details.getByText('FutureMakers NCR')).toBeVisible()
  await details.getByRole('button', { name: 'Close' }).click()

  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(coverage.getByRole('img', { name: 'Aggregate project coverage map' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('System Administrator can edit the approved page headings while fixed labels stay unchanged', async ({
  page,
}) => {
  await seedPrototypeSession(page, 'System Administrator')
  await page.goto('/settings/labels')

  await expect(page.getByRole('heading', { name: 'Edit Labels' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Dashboard' }).first()
  await expect(navigation.getByRole('link', { name: 'Beneficiaries', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible()

  await expect(page.getByLabel('Beneficiaries page heading')).toBeVisible()
  await expect(page.getByText(/Sidebar labels, sidebar section titles/i)).toBeVisible()

  const headingUpdates = [
    ['Projects page heading', 'Project Delivery Workspace'],
    ['Beneficiaries page heading', 'Beneficiary Progress Review'],
    ['Analytics page heading', 'Program Analysis Review'],
    ['Alerts page heading', 'Alerts Review Queue'],
    ['Recommendations page heading', 'Recommendation Review'],
    ['Reports page heading', 'Reporting Center'],
    ['Alerts Repository page heading', 'Alert Rule Library'],
    ['User Management page heading', 'Account Administration'],
    ['Edit Labels page heading', 'Page Heading Settings'],
  ] as const

  for (const [label, value] of headingUpdates) {
    await page.getByLabel(label).fill(value)
  }

  await page.getByRole('button', { name: 'Save headings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Page Heading Settings' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Beneficiaries', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Analytics', exact: true })).toBeVisible()

  const headingRoutes = [
    ['/projects', 'Project Delivery Workspace'],
    ['/beneficiaries', 'Beneficiary Progress Review'],
    ['/analytics', 'Program Analysis Review'],
    ['/alerts', 'Alerts Review Queue'],
    ['/recommendations', 'Recommendation Review'],
    ['/reports', 'Reporting Center'],
    ['/alerts/repository', 'Alert Rule Library'],
    ['/settings/users', 'Account Administration'],
    ['/settings/labels', 'Page Heading Settings'],
  ] as const

  for (const [route, heading] of headingRoutes) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Page Heading Settings' })).toBeVisible()

  await page.getByRole('button', { name: 'Restore defaults' }).click()
  await page.goto('/beneficiaries')
  await expect(page.getByRole('heading', { name: 'Beneficiary Journey Tracking' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit page heading' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: 'Beneficiaries', exact: true })).toBeVisible()
})

test('non-administrator roles cannot open the page-heading editor', async ({ page }) => {
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/settings/labels')

  await expect(page.getByText('Unauthorized access', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Projects page heading')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save headings' })).toHaveCount(0)
})

test('System Administrator can manage prototype users without server-side claims', async ({
  page,
}) => {
  await seedPrototypeSession(page, 'System Administrator')
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Administration', exact: true })).toBeVisible()
  await expect(
    page.getByText(
      'Review prototype users, approved page headings, alert rules, and production-planning notes.',
    ),
  ).toBeVisible()
  await expect(page.getByText(/sidebar item labels/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Alerts Repository' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit Labels' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Administration Overview' })).toHaveCount(0)
  const userManagementLink = page
    .getByRole('navigation', { name: 'Dashboard' })
    .first()
    .getByRole('link', { name: 'User Management', exact: true })
  await expect(userManagementLink).toBeVisible()
  await Promise.all([
    page.waitForURL(/\/settings\/users$/, { timeout: 30_000 }),
    userManagementLink.click(),
  ])

  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
  await expect(userManagementLink).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Administration Overview' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Prototype administration notice' })).toContainText(
    'do not create identities',
  )

  const userList = page.getByRole('list', { name: 'Prototype users' })
  await expect(userList.getByRole('listitem')).toHaveCount(6)
  const programManagerRow = userList
    .getByRole('listitem')
    .filter({ hasText: 'program.manager.a@demo.pathways.local' })

  await programManagerRow.getByRole('button', { name: 'View' }).click()
  const detailDialog = page.getByRole('dialog', { name: 'Prototype account details' })
  await expect(detailDialog.getByText('Program Manager', { exact: true })).toBeVisible()
  await expect(detailDialog.getByText('Grant Manager')).toHaveCount(0)
  await expect(detailDialog.getByText(/remain part of production planning/i)).toBeVisible()
  await detailDialog.getByRole('button', { name: 'Close' }).first().click()

  await programManagerRow
    .getByRole('button', { name: 'Account actions for Program Manager A' })
    .click()
  await page.getByRole('menuitem', { name: 'Edit prototype user' }).click()
  const editDialog = page.getByRole('dialog', { name: 'Edit prototype user' })
  await editDialog.getByLabel('Full name').fill('Program Manager Client Review')
  await editDialog.getByRole('button', { name: 'Save local changes' }).click()
  await expect(userList.getByText('Program Manager Client Review')).toBeVisible()

  await page.getByRole('button', { name: 'Create user' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create prototype user' })
  await createDialog.getByLabel('Full name').fill('New Project Officer')
  await createDialog.getByLabel('Email').fill('new.officer@demo.pathways.local')
  await createDialog.getByLabel('Project or access-scope labels').fill('FutureMakers NCR')
  await createDialog.getByRole('button', { name: 'Create locally' }).click()
  await expect(userList.getByRole('listitem')).toHaveCount(7)
  await expect(userList.getByText('New Project Officer')).toBeVisible()

  const officerRow = userList
    .getByRole('listitem')
    .filter({ hasText: 'project.officer.a@demo.pathways.local' })
  await officerRow.getByRole('button', { name: 'Account actions for Project Officer A' }).click()
  await page.getByRole('menuitem', { name: 'Deactivate locally' }).click()
  const deactivateDialog = page.getByRole('dialog', { name: 'Deactivate prototype account?' })
  await expect(deactivateDialog.getByText(/current session, navigation/i)).toBeVisible()
  await deactivateDialog.getByRole('button', { name: 'Deactivate locally' }).click()
  await expect(officerRow.getByText('Deactivated')).toBeVisible()

  await officerRow.getByRole('button', { name: 'Account actions for Project Officer A' }).click()
  await page.getByRole('menuitem', { name: 'Reactivate locally' }).click()
  await expect(officerRow.getByText('Active')).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole('list', { name: 'Prototype users' }).getByRole('listitem'),
  ).toHaveCount(6)
  await expect(page.getByText('New Project Officer')).toHaveCount(0)
})

test('user management remains concise and navigable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedPrototypeSession(page, 'System Administrator')
  await page.goto('/settings/users')

  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'User account summary' })).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: 'Role profiles and administration links' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Create user' }).click()
  await expect(page.getByRole('dialog', { name: 'Create prototype user' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('reports are filterable, previewable, and keep export actions prototype-only', async ({
  page,
}) => {
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/reports/indicator-summary')

  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(page.getByText('Generate a report.')).toBeVisible()
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText('Beneficiaries completing orientation')).toBeVisible()

  await page.getByRole('button', { name: 'Columns' }).click()
  await expect(page.getByRole('heading', { name: 'Select columns' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Select columns' })
    .getByRole('button', { name: 'Done' })
    .click()

  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Report Preview' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Report Preview' })
    .getByRole('button', { name: 'Close' })
    .first()
    .click()

  await Promise.all([
    page.waitForURL(/\/reports\/preview\?kind=indicator-summary$/, { timeout: 30_000 }),
    page.getByRole('link', { name: 'Open report preview' }).click(),
  ])
  await expect(page.getByRole('dialog', { name: 'Report Preview' })).toBeVisible()
})

test('report preview dialog remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedPrototypeSession(page, 'Program Manager')
  await page.goto('/reports/project-summary')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()

  const preview = page.getByRole('dialog', { name: 'Report Preview' })
  await expect(preview).toBeVisible()
  expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`responsive smoke at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'PATHWAYS Public Project Dashboard' }),
    ).toBeVisible()

    await seedPrototypeSession(page)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Program Manager dashboard' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Project context' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Review Project Portfolio' })).toBeVisible()
    await expect(page.getByText('Portfolio impact')).toHaveCount(0)

    if (viewport.width < 1024) {
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
    }
  })
}
