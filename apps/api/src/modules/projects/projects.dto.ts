import { Transform } from 'class-transformer'
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator'

const projectStatuses = ['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED']

export class CreateProjectDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code?: string

  @IsString()
  @Length(3, 160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  title!: string

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  objectives?: string

  @IsOptional()
  @IsString()
  @Length(0, 240)
  implementationArea?: string

  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string

  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string

  @IsIn(projectStatuses)
  status!: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'

  @IsOptional()
  @IsUUID()
  programId?: string
}

export class UpdateProjectDto extends CreateProjectDto {
  @IsDateString()
  expectedUpdatedAt!: string
}
