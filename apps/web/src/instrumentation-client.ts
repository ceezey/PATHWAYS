import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

import { webSentryOptions } from './lib/sentry'

// Next runs this file before any page code builds a schema; the content security policy refuses and reports zod's new Function probe.
z.config({ jitless: true })

Sentry.init(webSentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''))
