import { existsSync } from 'node:fs'
import path from 'node:path'
import { expect, it } from 'vitest'
import { z } from 'zod'

it('turns off zod code generation from the file Next loads first in the browser', async () => {
  // Next finds the file by this exact name next to src/app; a rename silently disables it.
  expect(existsSync(path.join(__dirname, 'instrumentation-client.ts'))).toBe(true)
  expect(existsSync(path.join(__dirname, 'app'))).toBe(true)
  expect(z.config().jitless).toBeFalsy()
  await import('./instrumentation-client')
  expect(z.config().jitless).toBe(true)
})
