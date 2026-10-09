import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { z } from 'zod'

// Parses one request part with a zod schema and answers the class-validator 400 shape on failure.
export class ZodPipe<S extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const parsed = this.schema.safeParse(value)
    if (parsed.success) return parsed.data
    throw new BadRequestException(
      parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join('.')} ${issue.message}` : issue.message,
      ),
    )
  }
}
