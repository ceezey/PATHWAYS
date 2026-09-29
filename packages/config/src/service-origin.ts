const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]']

/** Supabase service origins must be HTTPS. The only exception is the local
 * Supabase stack on a loopback host outside production (pnpm dev:local); a
 * remote plain-HTTP origin is never accepted.
 */
export const isApprovedServiceProtocol = (url: URL, nodeEnv = process.env.NODE_ENV) =>
  url.protocol === 'https:' ||
  (url.protocol === 'http:' && loopbackHosts.includes(url.hostname) && nodeEnv !== 'production')
