// Dependency-free so next.config.ts and the middleware decide the address split the same way.

/** Lowercase hostname without port or trailing dot, matching how Next's host conditions compare. */
export const siteHostname = (host: string) =>
  host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')

/** Both addresses when they are set to different hostnames; otherwise null (single address). */
export function splitSites(publicUrl = '', staffUrl = '') {
  if (!publicUrl || !staffUrl) return null
  const sites = { public: new URL(publicUrl), staff: new URL(staffUrl) }
  return sites.public.hostname === sites.staff.hostname ? null : sites
}
