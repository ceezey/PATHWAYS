import { once } from 'node:events'

export const MAX_RUNTIME_LINE = 1_000_000
export const OVERSIZED_OUTPUT = '[Oversized output withheld]'

// Import-safe: callers supply values. This module never reads env files or
// credentials, and tests use only synthetic canaries.
export function createRuntimeRedactor(valueSets) {
  const secrets = new Set()
  for (const values of valueSets) {
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue
      if (/KEY|SECRET|PASSWORD|DATABASE_URL|DIRECT_URL/i.test(key)) secrets.add(value)
      if (/DATABASE_URL|DIRECT_URL/.test(key)) {
        try {
          const parsed = new URL(value)
          if (parsed.password) {
            secrets.add(parsed.password)
            secrets.add(decodeURIComponent(parsed.password))
          }
        } catch {
          // Never emit invalid configuration.
        }
      }
    }
  }
  const ordered = [...secrets].sort((a, b) => b.length - a.length)
  return (text) => {
    let safe = text.replace(/postgres(?:ql)?:\/\/\S+/g, '[connection URL withheld]')
    for (const secret of ordered) safe = safe.split(secret).join('[secret withheld]')
    return safe.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT withheld]')
  }
}

export async function forwardRedactedLines(source, destination, redact) {
  source.setEncoding('utf8')
  let pending = ''
  let oversized = false
  async function emit(ending) {
    const safe = oversized ? OVERSIZED_OUTPUT : redact(pending)
    if (!destination.write(safe + ending)) await once(destination, 'drain')
    pending = ''
    oversized = false
  }
  for await (const chunk of source) {
    let start = 0
    while (start < chunk.length) {
      const newline = chunk.indexOf('\n', start)
      const end = newline < 0 ? chunk.length : newline
      if (!oversized) {
        if (pending.length + end - start > MAX_RUNTIME_LINE) {
          pending = ''
          oversized = true
        } else {
          pending += chunk.slice(start, end)
        }
      }
      // Discard the WHOLE oversized line through newline/EOF, including its
      // tail. Resetting only the buffer could expose a split secret suffix.
      if (newline < 0) break
      await emit('\n')
      start = newline + 1
    }
  }
  if (pending || oversized) await emit('')
}
