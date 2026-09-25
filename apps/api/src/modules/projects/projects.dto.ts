import { normalizeTargetGoal } from '@pathways/shared'
import { Transform } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateBy,
} from 'class-validator'

const projectStatuses = ['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED']
const IsTargetGoal = () =>
  ValidateBy({
    name: 'isTargetGoal',
    validator: {
      validate: (value: unknown) => {
        if (typeof value !== 'string') return false
        try {
          normalizeTargetGoal(value)
          return true
        } catch {
          return false
        }
      },
      defaultMessage: () =>
        'targetGoal must be greater than 0 and at most 100, with at most 4 decimal places.',
    },
  })

const IsMoneyAmount = () =>
  ValidateBy({
    name: 'isMoneyAmount',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/.test(value),
      defaultMessage: () =>
        'projectBudget must be a non-negative PHP amount with at most 2 decimal places.',
    },
  })

class ProjectFieldsDto {
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
  @IsString()
  @Length(0, 1000)
  implementingPartners?: string

  @IsOptional()
  @IsString()
  @Length(0, 160)
  sector?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  @Transform(({ value }) => (value === '' || value === null ? value : Number(value)))
  targetBeneficiaries?: number | null

  @IsOptional()
  @IsString()
  @IsMoneyAmount()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  projectBudget?: string

  @IsOptional()
  @IsUUID()
  programManagerId?: string | null

  @IsOptional()
  @IsUUID()
  projectManagerId?: string | null

  @IsOptional()
  @IsUUID()
  monitoringOfficerId?: string | null

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  projectOfficerIds?: string[]

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

export class CreateProjectDto extends ProjectFieldsDto {
  @IsString()
  @IsTargetGoal()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  targetGoal!: string
}

export class UpdateProjectDto extends ProjectFieldsDto {
  @IsOptional()
  @IsString()
  @IsTargetGoal()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  targetGoal?: string

  @IsDateString()
  expectedUpdatedAt!: string
}
