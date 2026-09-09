import type { PrototypeRole } from '@/types/prototype-role'

const ADMIN: PrototypeRole = 'System Administrator'
const PM: PrototypeRole = 'Project Manager'
const PROGRAM: PrototypeRole = 'Program Manager'
const ME: PrototypeRole = 'Monitoring and Evaluation Officer'
const PO: PrototypeRole = 'Project Officer'
const GRANT: PrototypeRole = 'Grant Manager'
const monitoring = [ADMIN, PM, PROGRAM, ME, GRANT]
const management = [ADMIN, PM, PROGRAM, GRANT]
const collection = [ADMIN, ME, PO]
const beneficiaries = [PM, ME, PO]

/** Final UCR action grants. Actor-list membership never implies mutation access. */
export const actionRoles = {
  'profile.edit': [ADMIN, PM, PROGRAM, ME, PO, GRANT],
  'users.view': [ADMIN, PM, PROGRAM],
  'users.create': [ADMIN, PM, PROGRAM],
  'users.edit': [ADMIN, PM, PROGRAM],
  'users.deactivate': [ADMIN, PM, PROGRAM],
  'users.authorize': [ADMIN, PM, PROGRAM],
  'projects.view': [ADMIN, PM, PROGRAM, ME, PO, GRANT],
  'projects.create': [ADMIN, PM],
  'projects.edit': [ADMIN, PM],
  'projects.archive': [ADMIN, PM],
  'projects.team.manage': [ADMIN, PM, PROGRAM, GRANT],
  'delivery.view': [ADMIN, PM, PROGRAM, ME, PO, GRANT],
  'activities.edit': [PM, PO],
  'milestones.review': [ME],
  'expenses.submit': [PO],
  'expenses.verify': [ME],
  'expenses.return': [ME],
  'progress.review': [PM],
  'progress.approve': [PM],
  'progress.return': [PM],
  'indicators.view': [ADMIN, PM, ME],
  'indicators.manage': [ADMIN, ME],
  'forms.view': collection,
  'forms.create': collection,
  'forms.edit': collection,
  'forms.publish': collection,
  'forms.export': collection,
  'entries.encode': [PO],
  'imports.run': collection,
  'beneficiaries.view': beneficiaries,
  'beneficiaries.create': beneficiaries,
  'beneficiaries.edit': beneficiaries,
  'beneficiaries.merge': [PM],
  'journeys.review': beneficiaries,
  'history.view': beneficiaries,
  'monitoring.view': monitoring,
  'dashboard.configure': monitoring,
  'analytics.view': monitoring,
  'saddd.view': monitoring,
  'visualizations.view': monitoring,
  'reports.generate': monitoring,
  'exports.download': monitoring,
  'alerts.review': monitoring,
  'recommendations.review': monitoring,
  'outcomes.log': [PM, PROGRAM],
  'rules.configure': [ADMIN],
  'audit.view': [ADMIN],
  'backup.create': [ADMIN],
  'backup.restore': [ADMIN],
  'public.review': management,
  'public.approve': management,
  'public.publish': management,
  'public.unpublish': management,
} satisfies Record<string, PrototypeRole[]>

export type DemoAction = keyof typeof actionRoles
export const hasAction = (role: PrototypeRole, action: DemoAction) =>
  (actionRoles[action] as PrototypeRole[]).includes(role)

export const creatableRoles = (role: PrototypeRole): PrototypeRole[] =>
  role === ADMIN
    ? [ADMIN, PM, PROGRAM, ME, PO, GRANT]
    : role === PROGRAM
      ? [PM, ME]
      : role === PM
        ? [PO, ME]
        : []

export interface DemoActor {
  id: string
  role: PrototypeRole
  projectIds: string[]
  status: 'Active' | 'Invited' | 'Deactivated'
}

export function assertAction(actor: DemoActor | undefined, action: DemoAction, projectId?: string) {
  if (!actor || actor.status !== 'Active' || !hasAction(actor.role, action)) {
    throw new Error('Your account does not have permission for this action.')
  }
  if (projectId && !actor.projectIds.includes(projectId)) {
    throw new Error('This project is outside your authorized scope.')
  }
}
