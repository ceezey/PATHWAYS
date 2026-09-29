import { z } from 'zod'

const token = z.string().regex(/^[a-f0-9]{64}$/)
export const rulesDispatcherEnvSchema = z
  .object({
    RULES_DISPATCH_API_BASE_URL: z
      .string()
      .url()
      .refine((value) => {
        try {
          const url = new URL(value)
          const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
          return (
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            (url.protocol === 'https:' || (local && url.protocol === 'http:')) &&
            /^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\/?$/.test(url.pathname) &&
            !value.includes('%') &&
            !value.includes('\\') &&
            !/\/\.\.?\//.test(value)
          )
        } catch {
          return false
        }
      }),
    RULES_DRAIN_TOKEN: token,
    RULES_SWEEP_TOKEN: token,
  })
  .refine((value) => value.RULES_DRAIN_TOKEN !== value.RULES_SWEEP_TOKEN)

export type RulesDispatcherEnv = z.infer<typeof rulesDispatcherEnvSchema>
export const readRulesDispatcherEnv = (input: NodeJS.ProcessEnv) =>
  rulesDispatcherEnvSchema.parse(input)
