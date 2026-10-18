import { strongPasswordSchema } from '@/features/auth'
import { z } from 'zod'

export const ownProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
  contactNumber: z
    .string()
    .trim()
    .max(30)
    .refine(
      (value) => !value || /^[+()\-\s0-9]{7,30}$/.test(value),
      'Enter a valid contact number.',
    ),
})
export const ownPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
