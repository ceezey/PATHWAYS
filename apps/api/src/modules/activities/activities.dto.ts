import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator'

const canonical = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

export class CreateActivityDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @Transform(canonical)
  code?: string

  @IsString()
  @Length(3, 160)
  title!: string

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  description?: string

  @IsOptional()
  @IsString()
  @Length(1, 80)
  activityType?: string

  @IsDateString({ strict: true })
  plannedStartDate!: string

  @IsDateString({ strict: true })
  plannedEndDate!: string

  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assignedUserIds!: string[]
}

export class UpdateActivityDto extends CreateActivityDto {
  @IsDateString()
  expectedUpdatedAt!: string
}

export class TransitionActivityDto {
  @IsIn(['IN_PROGRESS', 'CANCELLED'])
  status!: 'IN_PROGRESS' | 'CANCELLED'

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  reason?: string

  @IsDateString()
  expectedUpdatedAt!: string
}

export class SubmitActivityUpdateDto {
  @IsUUID()
  clientUpdateId!: string

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent!: number

  @IsString()
  @Length(1, 4000)
  note!: string
}

export class ReviewActivityUpdateDto {
  @IsIn(['APPROVE', 'RETURN'])
  decision!: 'APPROVE' | 'RETURN'

  @IsString()
  @Length(1, 1000)
  reason!: string

  @IsDateString()
  expectedUpdatedAt!: string
}

export class SaveMilestoneDto {
  @IsString()
  @Length(3, 160)
  title!: string

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string

  @IsOptional()
  @IsDateString({ strict: true })
  targetDate?: string
}

export class UpdateMilestoneDto extends SaveMilestoneDto {
  @IsIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status!: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

  @IsOptional()
  @IsDateString({ strict: true })
  completionDate?: string

  @IsDateString()
  expectedUpdatedAt!: string
}

export class JourneyStageInputDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @IsString()
  @Length(2, 40)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  @Transform(canonical)
  code!: string

  @IsString()
  @Length(2, 160)
  name!: string

  @IsInt()
  @Min(1)
  @Max(500)
  order!: number

  @IsIn(['ENTRY', 'CORE', 'BRANCH', 'FOLLOW_UP'])
  type!: 'ENTRY' | 'CORE' | 'BRANCH' | 'FOLLOW_UP'

  @IsOptional()
  @IsUUID()
  parentStageId?: string

  @IsOptional()
  @IsBoolean()
  terminal = false

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string

  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mappedActivityIds!: string[]

  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string
}

export class SaveJourneyConfigurationDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => JourneyStageInputDto)
  stages!: JourneyStageInputDto[]
}

export interface UploadedProofFile {
  buffer: Buffer
  originalname: string
  mimetype: string
  size: number
}
