import { readWebEnv } from '@pathways/config'

const suppliedSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const webEnv = readWebEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? suppliedSupabasePublishableKey,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? suppliedSupabasePublishableKey,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? suppliedSupabasePublishableKey,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS: process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  WEB_PORT: process.env.WEB_PORT,
})

export const webSupabasePublishableKey =
  webEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  webEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  webEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const webSetupState = {
  supabaseConfigured:
    Boolean(webEnv.NEXT_PUBLIC_SUPABASE_URL) && Boolean(webSupabasePublishableKey),
  authBypassEnabled: webEnv.NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS,
  sentryEnabled: Boolean(webEnv.NEXT_PUBLIC_SENTRY_DSN),
}
