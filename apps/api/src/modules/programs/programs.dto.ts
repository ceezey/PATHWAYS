import { Transform } from 'class-transformer'
import { IsDateString, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator'

export class CreateProgramDto {
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code!: string

  @IsString()
  @Length(3, 160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string

  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string

  @IsIn(['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'])
  status!: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
}
