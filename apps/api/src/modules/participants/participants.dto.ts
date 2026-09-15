import { IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator'

export class RecordParticipationDto {
  @IsUUID()
  formId!: string

  @IsUUID()
  clientSubmissionId!: string

  @IsObject()
  values!: Record<string, unknown>
}

export class EnrollmentJourneyEventDto {
  @IsIn(['COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER'])
  eventType!: 'COMPLETION' | 'FOLLOW_UP' | 'DROPOUT' | 'TRANSFER'

  @IsDateString({ strict: true })
  eventDate!: string

  @IsString()
  @Length(1, 2000)
  description!: string

  @IsOptional()
  @IsUUID()
  stageId?: string

  @IsOptional()
  @IsUUID()
  destinationProjectId?: string
}

export class CorrectJourneyEventDto {
  @IsDateString({ strict: true })
  eventDate!: string

  @IsString()
  @Length(1, 2000)
  description!: string

  @IsString()
  @Length(1, 1000)
  reason!: string

  @IsOptional()
  @IsUUID()
  stageId?: string
}

export function normalizedCode(value: unknown) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code) ? code : null
}

export function normalizedText(value: unknown, maximum = 2000) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= 1 && text.length <= maximum ? text : null
}
