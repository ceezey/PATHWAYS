import type { principalHasAtomicPermission } from '@/lib/rbac/policy'
import { type ReportKindCode, grantedReportKinds } from '@pathways/shared'

/** Download name from the saved report name, stripped of characters file systems reject. */
export const reportFileName = (name: string, reportId: string, extension: string) => {
  const base = Array.from(name, (char) => (char < ' ' || '\\/:*?"<>|'.includes(char) ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 150)
  return `${base || `report-${reportId}`}.${extension}`
}

type Principal = Parameters<typeof principalHasAtomicPermission>[0]

/** Kinds the principal may open: the shared grants, for a principal with exactly one role. */
export const allowedKinds = (profile: Principal): ReportKindCode[] =>
  profile?.roles.length === 1 ? grantedReportKinds(profile.roles[0], profile.permissions) : []
