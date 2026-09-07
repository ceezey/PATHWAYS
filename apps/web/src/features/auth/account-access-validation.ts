import { z } from 'zod'

const passwordMessage =
  'Use 15–64 characters with uppercase, lowercase, number, and symbol characters.'

export const strongPasswordSchema = z
  .string()
  .min(15, passwordMessage)
  .max(64, passwordMessage)
  .regex(/[a-z]/, passwordMessage)
  .regex(/[A-Z]/, passwordMessage)
  .regex(/[0-9]/, passwordMessage)
  .regex(/[^A-Za-z0-9]/, passwordMessage)

export const recoveryRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid staff email address.'),
})

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export type RecoveryRequestValues = z.infer<typeof recoveryRequestSchema>
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
