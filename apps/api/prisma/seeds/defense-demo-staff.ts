import { SYSTEM_ADMIN_EMAIL, dummyStaff, staffEmail } from './hosted-realistic-seed'
import type { Staff, StaffKey } from './local-demo-seed'

export type StaffRow = {
  id: string
  authUserId: string | null
  email: string
  organizationId: string
  roleCode: string
}

const keys: Array<{ key: StaffKey; role: string; emails: string[] }> = [
  {
    key: 'admin',
    role: 'SYSTEM_ADMINISTRATOR',
    emails: [
      SYSTEM_ADMIN_EMAIL,
      process.env.PATHWAYS_LOCAL_ADMIN_EMAIL ?? 'cian.francisco@pathways.example',
    ],
  },
  { key: 'programManager', role: 'PROGRAM_MANAGER', emails: ['maria.santos@pathways.example'] },
  { key: 'grantManager', role: 'GRANT_MANAGER', emails: ['jose.reyes@pathways.example'] },
  { key: 'projectManager', role: 'PROJECT_MANAGER', emails: ['ana.delacruz@pathways.example'] },
  {
    key: 'me',
    role: 'MONITORING_AND_EVALUATION_OFFICER',
    emails: ['carlo.mendoza@pathways.example'],
  },
  { key: 'liza', role: 'PROJECT_OFFICER', emails: ['liza.bautista@pathways.example'] },
  { key: 'emmanuel', role: 'PROJECT_OFFICER', emails: ['emmanuel.cruz@pathways.example'] },
]

// The hosted dummy staff addresses come from the hosted seed so the two seeds cannot drift.
for (const staff of dummyStaff) {
  const target = keys.find(
    (k) =>
      k.role === staff.role &&
      (staff.role !== 'PROJECT_OFFICER' ||
        (staff.firstName === 'Emmanuel') === (k.key === 'emmanuel')),
  )
  if (target) target.emails.unshift(staffEmail(staff))
}

export const maskEmail = (email: string) => {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 1)}***@${domain}`
}

const envName = (key: StaffKey) =>
  `DEMO_STAFF_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_EMAIL`

/** Picks one existing active user per actor key: env override, then known emails, then role. */
export function resolveStaff(users: StaffRow[], env: NodeJS.ProcessEnv = process.env) {
  const sorted = [...users].sort((a, b) => a.email.localeCompare(b.email))
  const used = new Set<string>()
  const picked = {} as Record<StaffKey, StaffRow>
  const missing: string[] = []
  for (const { key, role, emails } of keys) {
    const override = env[envName(key)]?.toLowerCase()
    const wanted = override ? [override] : emails.map((email) => email.toLowerCase())
    const free = (row: StaffRow) => !used.has(row.id) && row.roleCode === role
    let row = wanted
      .map((email) => sorted.find((u) => u.email.toLowerCase() === email && free(u)))
      .find(Boolean)
    if (!row && !override) row = sorted.find(free)
    if (!row) {
      missing.push(`${key} (${role}${override ? `, override ${envName(key)} not found` : ''})`)
      continue
    }
    used.add(row.id)
    picked[key] = row
  }
  if (missing.length)
    throw new Error(`No existing active user for: ${missing.join('; ')}. Users are never created.`)
  const organizationId = picked.admin.organizationId
  if (Object.values(picked).some((row) => row.organizationId !== organizationId || !row.authUserId))
    throw new Error('Staff must share one organization and have linked auth accounts.')
  return picked
}

export const describeStaff = (picked: Record<StaffKey, Pick<Staff, 'role' | 'email'>>) =>
  Object.entries(picked).map(([key, s]) => `  ${key} (${s.role}): ${maskEmail(s.email)}`)
