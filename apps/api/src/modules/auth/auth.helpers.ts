import { signInRequest } from '@pathways/shared'
import { isEmail } from 'class-validator'

// The sign-in body: the shared contract plus the class-validator email rule, which accepts a different address set than zod.
export const signInBody = signInRequest.refine((body) => isEmail(body.email), {
  path: ['email'],
  message: 'must be an email',
})
