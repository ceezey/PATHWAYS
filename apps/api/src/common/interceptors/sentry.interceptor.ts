import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { type Observable, catchError, throwError } from 'rxjs'

import { readApiEnv } from '@pathways/config'

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const env = readApiEnv(process.env)

    return next.handle().pipe(
      catchError((error) => {
        if (env.SENTRY_DSN_API) {
          Sentry.captureException(error)
        }

        return throwError(() => error)
      }),
    )
  }
}
