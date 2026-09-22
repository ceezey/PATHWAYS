import { describe, expect, it } from 'vitest'
import { pathwaysClient } from './pathways-client'

describe('budget client availability', () => {
  it('rejects budget reads without an endpoint instead of returning fabricated records', async () => {
    await expect(pathwaysClient.getBudgets('project-id')).rejects.toThrow(/Budget records/)
  })
})
