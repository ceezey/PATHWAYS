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
    .default('http://localhost:4000/api'),
  NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NEXT_PUBLIC_SENTRY_DSN: optionalString,
  WEB_PORT: z.coerce.number().default(3000),
})

export const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('api'),
  ENABLE_SWAGGER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  SUPABASE_JWT_SECRET: optionalString,
  DEV_ADMIN_EMAIL: z.string().email().default('admin@example.com'),
  DEV_ADMIN_SUPABASE_ID: z.string().default('00000000-0000-0000-0000-000000000000'),
  SENTRY_DSN_API: optionalString,
  UPLOADS_BUCKET: z.string().default('uploads'),
  REPORTS_BUCKET: z.string().default('reports'),
  PARTICIPANT_CARDS_BUCKET: z.string().default('participant-cards'),
  ASSETS_BUCKET: z.string().default('assets'),
})

export type WebEnv = z.infer<typeof webEnvSchema>
export type ApiEnv = z.infer<typeof apiEnvSchema>

export const readWebEnv = (input: Record<string, string | undefined> = process.env): WebEnv =>
  webEnvSchema.parse(input)

export const readApiEnv = (input: Record<string, string | undefined> = process.env): ApiEnv =>
  apiEnvSchema.parse(input)
