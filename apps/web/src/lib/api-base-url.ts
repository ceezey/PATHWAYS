const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Bearer tokens may only go to the configured API; local development keeps IPv4 loopback. */
export function approvedApiBaseUrl(
  candidate: string,
  trustedBaseUrl = 'http://127.0.0.1:4000/api',
): URL {
  const url = new URL(candidate)
  const configured = new URL(trustedBaseUrl)
  for (const value of [url, configured]) {
    if (value.username || value.password || value.search || value.hash) {
      throw new Error('Invalid API endpoint configuration.')
    }
  }

  const local = loopbackHosts.has(url.hostname) && loopbackHosts.has(configured.hostname)
  if (local) {
    if (url.protocol !== 'http:' || configured.protocol !== 'http:') {
      throw new Error('Invalid local API endpoint configuration.')
    }
    url.hostname = '127.0.0.1'
    return url
  }
  if (url.protocol !== 'https:' || configured.protocol !== 'https:') {
    throw new Error('Remote API endpoints require HTTPS.')
  }

  if (url.toString().replace(/\/$/, '') !== configured.toString().replace(/\/$/, '')) {
    throw new Error('API endpoint is not approved.')
  }
  return url
}
