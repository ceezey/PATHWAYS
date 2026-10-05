// Restore target and identities guards for the defense snapshot; validates input and connects to nothing.
import { assertHostedPgUrl } from './hosted-seed-target.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns HOSTED_ADMIN_URL once it is the postgres role on PATHWAYS-devV2. */
export function assertRestoreTarget(env) {
  const raw = env.HOSTED_ADMIN_URL
  if (!raw) throw new Error('HOSTED_ADMIN_URL (role postgres on PATHWAYS-devV2) is required.')
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('HOSTED_ADMIN_URL is not a valid URL.')
  }
  assertHostedPgUrl(url, 'HOSTED_ADMIN_URL', 'postgres')
  if (/.pooler.supabase.com$/i.test(url.hostname) && url.port && url.port !== '5432')
    throw new Error('HOSTED_ADMIN_URL on the pooler must use the session port 5432.')
  return raw
}

/** Drops Prisma-only query parameters that psql rejects, keeping sslmode. */
export function libpqUrl(raw) {
  const url = new URL(raw)
  for (const key of [...url.searchParams.keys()])
    if (key !== 'sslmode') url.searchParams.delete(key)
  return url.toString()
}

/** Checks the identities file shape without echoing any email or name. */
export function assertIdentities(identities) {
  const organizationId = identities?.organization?.id
  if (!UUID.test(String(organizationId)))
    throw new Error('Identities file has no valid organization id.')
  const users = identities.users
  if (!Array.isArray(users) || users.length === 0) throw new Error('Identities file has no users.')
  for (const [index, user] of users.entries()) {
    const authOk = user.auth_user_id === null || UUID.test(String(user.auth_user_id))
    const valid =
      UUID.test(String(user.id)) &&
      authOk &&
      user.organization_id === organizationId &&
      Boolean(user.role_code) &&
      Boolean(user.email)
    if (!valid) throw new Error(`Identities file user ${index} is invalid.`)
  }
  return identities
}

/** Latest finished migration name, as the restore and the mirror compare it. */
export const latestMigrationSql = () =>
  'SELECT max(migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'

/** Fails unless the local stack and devV2 report the same non-empty latest migration. */
export function assertSameMigration(local, hosted) {
  const [a, b] = [local, hosted].map((name) => String(name).trim())
  if (!a || a !== b)
    throw new Error(
      `Local migration (${a || 'none'}) and devV2 migration (${b || 'none'}) differ; align the local stack first.`,
    )
}
