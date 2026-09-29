import { IsOptional, IsString, MaxLength } from 'class-validator'

// Shape only. Digit and pattern rules are checked by the service and again in the database,
// with fixed messages; validation errors never echo the submitted value.
export class VerifyStepUpPinDto {
  @IsString()
  @MaxLength(32)
  pin!: string
}

export class ChangeStepUpPinDto {
  @IsString()
  @MaxLength(32)
  newPin!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  currentPin?: string
}
