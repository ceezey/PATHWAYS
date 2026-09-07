import { z } from 'zod'

import { strongPasswordSchema } from '@/features/auth/account-access-validation'

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
  contactNumber: z
    .string()
    .trim()
    .max(30, 'Use 30 characters or fewer.')
    .refine(
      (value) => value.length === 0 || /^[+()\-\s0-9]{7,30}$/.test(value),
      'Enter a valid contact number using digits, spaces, +, parentheses, or hyphens.',
    ),
  email: z.string().trim().email('Enter a valid email address.'),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((values) => values.currentPassword !== values.newPassword, {
    message: 'Choose a password that differs from your current password.',
    path: ['newPassword'],
  })

export type ProfileValues = z.infer<typeof profileSchema>
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>
