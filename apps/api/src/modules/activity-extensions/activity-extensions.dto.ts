import { IsDateString, IsISO8601, IsIn, IsString, IsUUID, Length, Matches } from 'class-validator'

export class RequestActivityExtensionDto {
  @IsUUID()
  clientMutationId!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  requestedEndDate!: string

  @IsString()
  @Length(10, 2000)
  reason!: string
}

export class VerifyActivityExtensionDto {
  @IsIn(['VERIFY', 'RETURN'])
  decision!: 'VERIFY' | 'RETURN'

  @IsString()
  @Length(10, 2000)
  note!: string

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string
}

export class DecideActivityExtensionDto {
  @IsUUID()
  clientMutationId!: string

  @IsIn(['APPROVE', 'DECLINE'])
  decision!: 'APPROVE' | 'DECLINE'

  @IsString()
  @Length(10, 2000)
  note!: string

  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string

  @IsISO8601({ strict: true })
  activityExpectedUpdatedAt!: string
}
