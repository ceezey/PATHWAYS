import { z } from 'zod'

export const loginSchema = z
  .object({
    identifier: z
      .string()
      .trim()
      .min(1, 'Enter your staff email.')
      .max(254, 'Enter a valid staff email.')
      .email('Enter a valid staff email.'),
    // Validate presence and a defensive input bound only. Sign-in must not
    // rewrite a valid existing password or apply the new-password policy.
    password: z.string().min(1, 'Enter your password.').max(1024, 'Password is too long.'),
  })
  .strict()

export type LoginSchema = z.infer<typeof loginSchema>
