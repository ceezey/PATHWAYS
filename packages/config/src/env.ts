import { z } from 'zod'

const optionalUrl = z.union([z.string().url(), z.literal('')]).default('')
const optionalString = z.string().default('')

export const webEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_API_BASE_URL: optionalUrl
    .or(z.string().startsWith('/'))
    .default('http://127.0.0.1:4000/api'),
  NEXT_PUBLIC_SENTRY_DSN: optionalString,
  NEXT_PUBLIC_STAFF_PORTAL_BASE_URL: optionalUrl,
  STAFF_PORTAL_BASE_URL: optionalUrl,
  WEB_PORT: z.coerce.number().default(3000),
})

export const apiEnvSchema = z
  .object({
    API_PORT: z.coerce.number().default(4000),
    API_PREFIX: z.string().default('api'),
    ENABLE_SWAGGER: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    RULES_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    RULES_WORKER_DATABASE_URL: optionalString,
    RULES_SWEEPER_DATABASE_URL: optionalString,
    RULES_DRAIN_TOKEN: optionalString,
    RULES_SWEEP_TOKEN: optionalString,
    RULES_RUNTIME_VERIFIED_MS: z.coerce.number().int().nonnegative().default(0),
    RULES_PERIODIC_DRAIN_VERIFIED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DATABASE_URL: optionalString,
    DIRECT_URL: optionalString,
    SUPABASE_URL: optionalUrl,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_JWT_SECRET: optionalString,
    WEB_ORIGIN: optionalUrl,
    SENTRY_DSN_API: optionalString,
    UPLOADS_BUCKET: z.string().default('uploads'),
    EVIDENCE_BUCKET: z.string().default('pathways-private'),
    // Per-file activity evidence limit in bytes. The default matches the local 50 MiB storage
    // limit and must not exceed the hosted bucket/global limits; 104857600 is the ceiling.
    EVIDENCE_MAX_FILE_BYTES: z
      .string()
      .regex(/^[1-9][0-9]{0,8}$/, 'EVIDENCE_MAX_FILE_BYTES must be a whole number of bytes.')
      .default('52428800')
      .transform(Number)
      .pipe(z.number().int().min(1_048_576).max(104_857_600)),
    BUSINESS_TIME_ZONE: z.string().default('Asia/Manila'),
    REPORTS_BUCKET: z.string().default('reports'),
    PARTICIPANT_CARDS_BUCKET: z.string().default('participant-cards'),
    ASSETS_BUCKET: z.string().default('assets'),
  })
  .superRefine((env, context) => {
    if (!env.RULES_WORKER_ENABLED) return
    const issue = (path: string, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
    const token = /^[a-f0-9]{64}$/
    if (!token.test(env.RULES_DRAIN_TOKEN))
      issue('RULES_DRAIN_TOKEN', 'A fixed dedicated drain credential is required.')
    if (!token.test(env.RULES_SWEEP_TOKEN) || env.RULES_SWEEP_TOKEN === env.RULES_DRAIN_TOKEN)
      issue('RULES_SWEEP_TOKEN', 'A distinct dedicated sweep credential is required.')
    const worker = ruleDatabaseEndpoint(env.RULES_WORKER_DATABASE_URL, 'pathways_rules_worker')
    const sweeper = ruleDatabaseEndpoint(env.RULES_SWEEPER_DATABASE_URL, 'pathways_rules_sweeper')
    if (!worker)
      issue('RULES_WORKER_DATABASE_URL', 'Dedicated worker database configuration is invalid.')
    if (!sweeper || (worker && sweeper !== worker))
      issue('RULES_SWEEPER_DATABASE_URL', 'Dedicated sweeper database configuration is invalid.')
    if (env.BUSINESS_TIME_ZONE !== 'Asia/Manila')
      issue('BUSINESS_TIME_ZONE', 'Rules require the approved database business calendar.')
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: env.BUSINESS_TIME_ZONE })
    } catch {
      issue('BUSINESS_TIME_ZONE', 'The approved database business calendar is unavailable.')
    }
    if (env.RULES_RUNTIME_VERIFIED_MS < 30000)
      issue(
        'RULES_RUNTIME_VERIFIED_MS',
        'Reviewed native runtime budget evidence is required before enabling.',
      )
    if (!env.RULES_PERIODIC_DRAIN_VERIFIED)
      issue(
        'RULES_PERIODIC_DRAIN_VERIFIED',
        'Reviewed periodic drain provisioning is required before enabling.',
      )
  })

// Backend-only endpoint validation. Do not copy these fields into webEnvSchema.
function ruleDatabaseEndpoint(value: string, role: string): string | undefined {
  try {
    const url = new URL(value)
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !new RegExp(`^${role}(?:\\.[a-z]{20})?$`).test(url.username) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      return
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if (!local && (!url.password || url.searchParams.get('sslmode') !== 'require')) return
    return JSON.stringify([url.hostname, url.port || '5432', url.pathname])
  } catch {
    return
  }
}

export type WebEnv = z.infer<typeof webEnvSchema>
export type ApiEnv = z.infer<typeof apiEnvSchema>

export const readWebEnv = (input: Record<string, string | undefined> = process.env): WebEnv =>
  webEnvSchema.parse(input)

export const readApiEnv = (input: Record<string, string | undefined> = process.env): ApiEnv =>
  apiEnvSchema.parse(input)
