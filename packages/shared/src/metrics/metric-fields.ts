import { z } from 'zod'
import { isCalendarDate } from './metric-math'

// Field schemas for the metric and indicator contracts, kept out of the package barrel.
export const date = z
  .string()
  .refine(isCalendarDate, 'Use a real YYYY-MM-DD date from 1900 through 2100.')
export const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/)
export const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase())
