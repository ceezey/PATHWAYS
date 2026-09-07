export function validatePhase6MigrationUrl(value: string | undefined) {
  if (!value) throw new Error('Protected Phase 6 migration connection is missing.')
  const url = new URL(value)
  const allowedParameters = new Set(['sslmode', 'connect_timeout', 'connection_limit'])
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== 'aws-1-ap-southeast-2.pooler.supabase.com' ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    decodeURIComponent(url.username) !== 'prisma.pdqwsknbzkdtiwjjibqt' ||
    !url.password ||
    url.hash ||
    url.searchParams.getAll('sslmode').length !== 1 ||
    url.searchParams.get('sslmode') !== 'require' ||
    url.searchParams.getAll('connect_timeout').length !== 1 ||
    url.searchParams.get('connect_timeout') !== '30' ||
    url.searchParams.getAll('connection_limit').length !== 1 ||
    url.searchParams.get('connection_limit') !== '1' ||
    [...url.searchParams.keys()].some((key) => !allowedParameters.has(key))
  ) {
    throw new Error('Phase 6 migration connection is outside the approved target.')
  }
  return value
}
