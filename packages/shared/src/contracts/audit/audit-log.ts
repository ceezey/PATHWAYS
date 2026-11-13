import { z } from 'zod'
import { isCalendarDate } from '../../metrics/metric-math'

// Readable audit modules in display order; each stored entity type belongs to exactly one.
export const AUDIT_MODULES = [
  {
    key: 'projects',
    label: 'Projects',
    entityTypes: ['Project', 'Program', 'ProjectMilestone', 'ProjectMapPin', 'ProjectPublication'],
  },
  {
    key: 'activities',
    label: 'Activities',
    entityTypes: [
      'ProjectActivity',
      'ActivityUpdate',
      'ActivityExtensionRequest',
      'ActivityEscalation',
      'ActivityOverdueExplanation',
    ],
  },
  {
    key: 'indicators',
    label: 'Indicators',
    entityTypes: ['ProjectIndicator', 'IndicatorLibraryEntry'],
  },
  {
    key: 'beneficiaries',
    label: 'Beneficiaries',
    entityTypes: [
      'Beneficiary',
      'BeneficiaryProjectEnrollment',
      'BeneficiaryJourneyEvent',
      'BeneficiaryActivityParticipation',
      'BeneficiaryStepUp',
      'JourneyStage',
    ],
  },
  { key: 'forms', label: 'Forms', entityTypes: ['DigitalForm', 'FormSubmission'] },
  { key: 'imports', label: 'Data import', entityTypes: ['DataImportBatch', 'DataImportRow'] },
  { key: 'evidence', label: 'Evidence and media', entityTypes: ['EvidenceMedia'] },
  {
    key: 'finance',
    label: 'Budget and expenses',
    entityTypes: ['ProjectBudgetRecord', 'BudgetExpenseEntry'],
  },
  {
    key: 'evaluations',
    label: 'Evaluations',
    entityTypes: ['ProjectEvaluation', 'ProjectEvaluationCriterion', 'AssessmentResult'],
  },
  {
    key: 'alerts',
    label: 'Alerts and recommendations',
    entityTypes: [
      'AlertRule',
      'RuleBasedAlert',
      'RuleDecision',
      'RulesSnapshot',
      'DecisionRecommendation',
    ],
  },
  { key: 'reports', label: 'Reports', entityTypes: ['Report'] },
  { key: 'dashboards', label: 'Dashboards', entityTypes: ['Dashboard'] },
  { key: 'users', label: 'Users and sign-in', entityTypes: ['SystemUser', 'Authentication'] },
  { key: 'audit', label: 'Audit Log', entityTypes: ['AuditLog'] },
  // On the server, any entity type not listed above counts as other.
  { key: 'other', label: 'Other', entityTypes: [] },
] as const

export type AuditModuleKey = (typeof AUDIT_MODULES)[number]['key']

// Returns the readable module for a stored entity type, or Other when it is not listed.
export const auditModuleOf = (entityType: string): { key: AuditModuleKey; label: string } => {
  const found = AUDIT_MODULES.find((m) => (m.entityTypes as readonly string[]).includes(entityType))
  const { key, label } = found ?? AUDIT_MODULES[AUDIT_MODULES.length - 1]
  return { key, label }
}

const day = z.string().refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')
const moduleKeys = AUDIT_MODULES.map((m) => m.key) as [AuditModuleKey, ...AuditModuleKey[]]

// Audit list query: project, readable module, Manila calendar date range, keyword and cursor paging.
export const auditQuerySchema = z
  .object({
    projectId: z.guid().optional(),
    module: z.enum(moduleKeys).optional(),
    from: day.optional(),
    to: day.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    cursor: z
      .string()
      .max(80)
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[a-f0-9-]{36}$/i)
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((i) => !i.from || !i.to || i.from <= i.to, {
    message: 'The From date must not be after the To date.',
  })

export type AuditQuery = z.infer<typeof auditQuerySchema>
export type AuditQueryInput = z.input<typeof auditQuerySchema>
