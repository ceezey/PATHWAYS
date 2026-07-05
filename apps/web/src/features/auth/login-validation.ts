import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Enter your username or email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export type LoginSchema = z.infer<typeof loginSchema>
