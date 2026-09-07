import { createConnection } from 'node:net'
import { pathToFileURL } from 'node:url'

export const DEVELOPMENT_HOST = '127.0.0.1'
export const DEVELOPMENT_PORT = 3000

export function assertDevelopmentPortFree({
  host = DEVELOPMENT_HOST,
  port = DEVELOPMENT_PORT,
  timeoutMs = 1_000,
} = {}) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port })
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      socket.destroy()
      error ? reject(error) : resolve()
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(new Error('development port is already in use')))
    socket.once('timeout', () => finish(new Error('development port availability is uncertain')))
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') finish()
      else finish(new Error('development port availability could not be verified'))
    })
  })
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined
if (invokedPath === import.meta.url) {
  try {
    await assertDevelopmentPortFree()
  } catch {
    console.error(
      'PATHWAYS web startup refused: 127.0.0.1:3000 is occupied. Stop the existing owned server instead of starting a second instance.',
    )
    process.exitCode = 1
  }
}
