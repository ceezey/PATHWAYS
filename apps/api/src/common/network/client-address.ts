import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

const TOKEN = /^[a-f0-9]{64}$/
const UNKNOWN = 'unknown'

const header = (request: IncomingMessage, name: string): string | undefined => {
  const value = request.headers[name]
  return typeof value === 'string' ? value.trim() : undefined
}
const valid = (value: string | undefined): value is string => !!value && isIP(value) !== 0

/** The caller's address: Vercel's x-real-ip there, the socket elsewhere; x-forwarded-for is never read because a client can send it. */
export function clientAddress(request: IncomingMessage): string {
  const candidate =
    process.env.VERCEL === '1' ? header(request, 'x-real-ip') : request.socket?.remoteAddress
  return valid(candidate) ? candidate : UNKNOWN
}

/** The address the public web server forwards for a visitor, honoured only with the shared token; else the caller's own address. */
export function visitorAddress(request: IncomingMessage, token: string): string {
  const sent = header(request, 'x-pathways-visitor-token')
  const address = header(request, 'x-pathways-visitor-address')
  if (
    TOKEN.test(token) &&
    sent !== undefined &&
    TOKEN.test(sent) &&
    timingSafeEqual(Buffer.from(sent, 'hex'), Buffer.from(token, 'hex')) &&
    valid(address)
  )
    return address
  return clientAddress(request)
}
