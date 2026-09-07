export const IPV4_LOOPBACK_HOST = '127.0.0.1' as const

interface LocalListenApplication {
  listen(port: number, hostname: typeof IPV4_LOOPBACK_HOST): Promise<unknown>
}

/**
 * Keep developer API processes reachable only from this computer.
 * A future non-local deployment needs a separately reviewed listener policy.
 */
export const listenOnIpv4Loopback = (app: LocalListenApplication, port: number) =>
  app.listen(port, IPV4_LOOPBACK_HOST)
