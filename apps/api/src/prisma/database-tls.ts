import { existsSync } from 'node:fs'
import { join } from 'node:path'

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]']

// Each path is a separate literal join so Vercel's file tracer (nft) bundles the certificate.
const caPath = () => {
  const compiled = join(__dirname, 'supabase-root-2021-ca.crt')
  const fromApp = join(process.cwd(), 'src', 'prisma', 'supabase-root-2021-ca.crt')
  const fromRepo = join(process.cwd(), 'apps', 'api', 'src', 'prisma', 'supabase-root-2021-ca.crt')
  return [compiled, fromApp, fromRepo].find((path) => existsSync(path))
}

export class DatabaseCaMissingError extends Error {
  constructor() {
    super('Database CA certificate is missing; refusing an unverified connection.')
  }
}

/** Makes Prisma verify a hosted server certificate against Supabase's root CA; local URLs pass through. */
export function verifiedDatabaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    // The raw error carries the input, which holds the password.
    throw new Error('Database URL is invalid.')
  }
  if (LOCAL_HOSTS.includes(url.hostname)) return value
  const ca = caPath()
  if (!ca) throw new DatabaseCaMissingError()
  url.searchParams.set('sslmode', 'require') // prefer would allow a plaintext fallback
  url.searchParams.set('sslcert', ca)
  url.searchParams.set('sslaccept', 'strict')
  return url.toString()
}
