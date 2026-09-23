import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

import { supportedFormFieldTypes } from '@pathways/shared'

const formTypes = [
  'BENEFICIARY_REGISTRATION',
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'OUTCOME_MONITORING',
  'ACTIVITY_MONITORING',
  'OTHER',
] as const

export class FormFieldDto {
  @IsString()
  @Length(1, 64)
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  code!: string

  @IsString()
  @Length(1, 160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  label!: string

  @IsIn(supportedFormFieldTypes)
  dataType!: (typeof supportedFormFieldTypes)[number]

  @IsBoolean()
  required!: boolean

  @IsBoolean()
  metadataKey!: boolean

  @IsBoolean()
  sadddField!: boolean

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  allowedValues?: string[]

  @IsOptional()
  @IsString()
  @Matches(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/)
  minimumValue?: string

  @IsOptional()
  @IsString()
  @Matches(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/)
  maximumValue?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  minimumDate?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  maximumDate?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  minimumLength?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maximumLength?: number
}

export class CreateFormDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  code!: string

  @IsString()
  @Length(3, 160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string

  @IsIn(formTypes)
  formType!: (typeof formTypes)[number]

  @IsOptional()
  @IsUUID()
  activityId?: string

  @IsOptional()
  @IsUUID()
  journeyStageId?: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields!: FormFieldDto[]
}

export class UpdateFormDto extends CreateFormDto {
  @IsDateString()
  expectedUpdatedAt!: string
}

export class ExpectedVersionDto {
  @IsDateString()
  expectedUpdatedAt!: string
}

export class SaveSubmissionDto {
  @IsUUID()
  clientSubmissionId!: string

  @IsObject()
  values!: Record<string, unknown>
}

export class ListSubmissionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset = 0

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10
}

export class ValidateValuesDto {
  @IsObject()
  values!: Record<string, unknown>
}

export class UpdateSubmissionDto {
  @IsDateString()
  expectedUpdatedAt!: string

  @IsObject()
  values!: Record<string, unknown>
}

export class SubmitSubmissionDto {
  @IsDateString()
  expectedUpdatedAt!: string
}
