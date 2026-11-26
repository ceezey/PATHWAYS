import * as Sentry from '@sentry/nextjs'

import { webSentryOptions } from './lib/sentry'

/** Starts error reporting in the Node and edge runtimes; an empty DSN leaves it off. */
export function register() {
  Sentry.init(webSentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''))
}

export const onRequestError = Sentry.captureRequestError
