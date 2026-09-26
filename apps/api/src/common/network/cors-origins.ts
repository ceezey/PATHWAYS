const localWebOrigins = ['http://127.0.0.1:3000', 'http://localhost:3000'] as const

export function allowedWebOrigins(configuredOrigin: string) {
  if (!configuredOrigin) return [...localWebOrigins]
  const url = new URL(configuredOrigin)
  if (
    url.origin !== configuredOrigin ||
    url.protocol !== 'https:' ||
    url.hostname.includes('*') ||
    url.username ||
    url.password
  ) {
    throw new Error('WEB_ORIGIN must be an HTTPS origin.')
  }
  return [...localWebOrigins, configuredOrigin]
}
